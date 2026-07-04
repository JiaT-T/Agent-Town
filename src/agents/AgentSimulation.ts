import {
  LLMClient,
  type LLMDialogueResult,
  type LLMPlanResult,
  type LLMPlayerDialogueResult,
  type LLMRuntimeConfig,
} from '../ai/LLMClient';
import { makeAppearance } from '../appearance/types';
import type { DialogueProvider } from '../ai/DialogueProvider';
import { TemplateDialogueProvider } from '../ai/TemplateDialogueProvider';
import { createInitialAgents } from '../data/npcs';
import {
  findLocationAt,
  findLocationByText,
  LOCATIONS,
  LOCATION_BY_ID,
  type LocationId,
  type TownLocation,
} from '../data/locations';
import {
  cellToWorld,
  BUILDING_ACTIVITY_POINTS,
  COUNTER_ANCHORS,
  GRID_HEIGHT,
  GRID_WIDTH,
  isWalkableCell,
  LOCATION_TARGETS,
  locationEntranceWorld,
  locationTargetWorld,
  nearestWalkableCell,
  worldToCell,
} from '../data/townGrid';
import {
  PLAYER_DIALOGUE_OPTIONS,
  type PlayerDialogueOptionId,
  type PlayerMovementInput,
  type PlayerProfile,
  type PlayerProfileInput,
  type PlayerState,
  type PlayerStats,
} from '../player/types';
import { isAgentInterestedInEvent } from './DecisionEngine';
import { findPath, type GridPoint, type PathfindingGrid } from './Pathfinding';
import { memoryStore } from './MemoryStore';
import { PlanningEngine } from './PlanningEngine';
import { ReflectionEngine } from './ReflectionEngine';
import { ReplayRecorder } from './ReplayRecorder';
import { SocialGraph } from './SocialGraph';
import { remember } from './memory';
import { DAY_MINUTES, formatTime, minutesUntil, parseTimeToMinutes } from './time';
import type { Agent, LLMRuntimeStatus, LogEntry, Observation, PlanResult, WorldEvent } from './types';
import type { TradeResult } from '../trade/types';

const VIRTUAL_MINUTES_PER_SECOND = 2.2;
const CONVERSATION_DISTANCE = 78;
const BUBBLE_DURATION_MS = 5200;
const EVENT_RESPONSE_DISTANCE_MINUTES = 90;
const PATH_REACHED_DISTANCE = 5;
const LLM_ATTEMPT_COOLDOWN_MS = 25_000;
const REFLECTION_IMPORTANCE_THRESHOLD = 4;
const PLAYER_WALK_SPEED = 370;
const PLAYER_RUN_SPEED = 550;
const PLAYER_RADIUS = 4.5;
const PLAYER_MAX_COLLISION_STEP = 6;
const PLAYER_INTERACTION_DISTANCE = 58;
const PLAYER_EVENT_DISTANCE = 74;
const PLAYER_BUILDING_DISTANCE = 42;
const PLAYER_GATHERING_TEXT = '18:00 Town Square has a music party';
const FOLLOW_PLAYER_DISTANCE = 44;
const FOLLOW_PLAYER_REPATH_DISTANCE = 28;
const FOLLOW_PLAYER_DURATION_MINUTES = 140;

function cloneAgents(): Agent[] {
  return createInitialAgents().map((agent) => ({
    ...agent,
    position: { ...agent.position },
    counterAnchor: agent.counterAnchor ? { ...agent.counterAnchor } : undefined,
    appearance: { ...agent.appearance },
    tradeProfile: agent.tradeProfile
      ? {
          ...agent.tradeProfile,
          offers: agent.tradeProfile.offers.map((offer) => ({ ...offer })),
        }
      : undefined,
    needs: { ...agent.needs },
    schedule: agent.schedule.map((entry) => ({ ...entry })),
    dailyPlan: agent.dailyPlan.map((entry) => ({ ...entry })),
    currentTaskDecomposition: agent.currentTaskDecomposition.map((entry) => ({ ...entry })),
    memories: [],
    retrievedMemories: [],
    reflection: 'No reflection yet.',
    relationships: {},
    currentPath: [],
    pathIndex: 0,
    pathStatus: 'No path calculated yet.',
    lastLLMDecision: 'No LLM decision yet.',
    facing: 'down',
    isMoving: false,
    animationState: 'idle-down',
    interestedEventIds: [],
  }));
}

function distance(a: Agent, b: Agent): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function eventId(): string {
  return `event-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function logId(): string {
  return `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function extractEventTitle(message: string, locationName: string): string {
  const withoutTime = message.replace(/^\s*(?:[01]?\d|2[0-3]):[0-5]\d\s+/, '').trim();
  const withoutLocation = withoutTime.replace(new RegExp(`^${locationName}\\s+`, 'i'), '').trim();
  const normalized = withoutLocation.replace(/^has\s+(?:a|an|the)?\s*/i, '').trim();
  const lower = normalized.toLowerCase();

  if (lower.includes('music party')) return 'the music party';
  if (lower.includes('evening gathering') || lower.includes('gathering')) return 'the evening gathering';
  if (lower.includes('meeting')) return 'the meeting';
  if (normalized) return `the ${normalized}`;
  return 'the broadcast event';
}

function pathKey(agent: Agent): string {
  return `${agent.destination}:${agent.currentPath.map((cell) => `${cell.x},${cell.y}`).join('|')}`;
}

function stableIndex(id: string, length: number, salt: number): number {
  if (length <= 0) {
    return 0;
  }

  const hash = id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return Math.abs(hash + salt) % length;
}

function initialLLMStatus(): LLMRuntimeStatus {
  return {
    mode: 'Fallback',
    lastCall: 'No LLM call yet.',
    lastLatencyMs: 0,
    lastPromptType: 'none',
    lastResultSummary: 'No LLM result yet.',
    lastFailureReason: 'Fallback: missing .env until the local LLM proxy is configured.',
    callCounts: {
      plan: 0,
      dialogue: 0,
      reflection: 0,
    },
    fallbackCount: 0,
  };
}

function defaultPlayerProfile(): PlayerProfile {
  return {
    name: 'Player',
    gender: 'custom',
    role: 'Visitor',
    personalityTags: ['curious', 'social'],
    objective: 'Organize Evening Gathering',
    spawnLocation: 'townSquare',
    appearance: makeAppearance('traveler-blue'),
  };
}

function defaultPlayerStats(): PlayerStats {
  return {
    energy: 86,
    social: 62,
    hunger: 78,
    reputation: 20,
    curiosity: 70,
  };
}

function createPlayerState(profile: PlayerProfile = defaultPlayerProfile(), stats: PlayerStats = defaultPlayerStats()): PlayerState {
  const spawnCell = nearestWalkableCell(LOCATION_TARGETS[profile.spawnLocation]);
  const spawnPosition = cellToWorld(spawnCell);

  return {
    id: 'player',
    profile,
    position: spawnPosition,
    facing: 'down',
    isMoving: false,
    animationState: 'idle-down',
    stats,
    quest: {
      id: 'organize-evening-gathering',
      title: 'Organize Evening Gathering',
      talkedNpcIds: [],
      invitedNpcIds: [],
      completed: false,
    },
    interactionHint: {
      kind: 'none',
      label: 'Move near an NPC, event marker, or building entrance.',
    },
  };
}

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function pointDistance(a: { position: { x: number; y: number } }, b: { position: { x: number; y: number } }): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

function worldDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class AgentSimulation {
  started = false;
  agents: Agent[] = [];
  events: WorldEvent[] = [];
  logs: LogEntry[] = [];
  player: PlayerState = createPlayerState();
  selectedAgentId?: string;
  timeMinutes = 8 * 60;
  paused = false;
  timeScale = 1;
  debug = {
    showGrid: false,
    showObstacles: false,
    showPath: false,
  };
  llmStatus: LLMRuntimeStatus = initialLLMStatus();

  private elapsedMs = 0;
  private readonly planningEngine = new PlanningEngine();
  private readonly reflectionEngine = new ReflectionEngine();
  private readonly replayRecorder = new ReplayRecorder();
  private readonly socialGraph = new SocialGraph();
  private readonly llmClient = new LLMClient();
  private readonly dialogueProvider: DialogueProvider;
  private readonly pendingLLMPlans = new Set<string>();
  private readonly pendingLLMDialogues = new Set<string>();
  private readonly pendingLLMReflections = new Set<string>();
  private readonly lastLLMAttemptMs = new Map<string, number>();
  private readonly loggedLLMFailures = new Set<string>();
  private readonly reflectionSourceKeys = new Map<string, string>();
  private readonly pathFailureKeys = new Set<string>();
  private readonly pathCache = new Map<string, GridPoint[]>();
  private llmUnavailable = false;
  private lastInteractionHintMs = -Infinity;
  private lastInteractionHintPosition = { x: Number.NaN, y: Number.NaN };
  private lastQuestCheckMs = -Infinity;
  private readonly pathfindingGrid: PathfindingGrid = {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    isWalkable: (point) => isWalkableCell(point.x, point.y),
  };

  constructor(dialogueProvider: DialogueProvider = new TemplateDialogueProvider()) {
    this.dialogueProvider = dialogueProvider;
    this.llmClient.loadStoredConfig();
    this.addLog('Create your player to start the town simulation.');
    this.updatePlayerInteractionHint(true);
  }

  get timeLabel(): string {
    return formatTime(this.timeMinutes);
  }

  get selectedAgent(): Agent | undefined {
    return this.agents.find((agent) => agent.id === this.selectedAgentId);
  }

  exportReplay() {
    return this.replayRecorder.export();
  }

  getCounterAnchor(locationId: LocationId) {
    const anchor = COUNTER_ANCHORS[locationId];
    return anchor ? cellToWorld(nearestWalkableCell(anchor)) : undefined;
  }

  getBuildingActivityPoints(locationId: LocationId) {
    return (BUILDING_ACTIVITY_POINTS[locationId] ?? [LOCATION_TARGETS[locationId]]).map((point) =>
      cellToWorld(nearestWalkableCell(point)),
    );
  }

  setSelectedAgent(agentId: string): void {
    this.selectedAgentId = agentId;
  }

  clearSelectedAgent(): void {
    this.selectedAgentId = undefined;
  }

  togglePaused(): void {
    this.paused = !this.paused;
  }

  cycleSpeed(): void {
    const speeds = [1, 4, 12];
    const currentIndex = speeds.indexOf(this.timeScale);
    this.timeScale = speeds[(currentIndex + 1) % speeds.length];
  }

  setDebugFlag(flag: keyof AgentSimulation['debug'], value: boolean): void {
    this.debug[flag] = value;
  }

  retryLLM(): void {
    this.llmUnavailable = false;
    this.lastLLMAttemptMs.clear();
    this.loggedLLMFailures.clear();
    this.llmStatus = {
      ...this.llmStatus,
      mode: 'Fallback',
      lastCall: 'Manual LLM retry requested.',
      lastFailureReason: 'Retry pending. The next Agent Loop will try the local LLM proxy again.',
      lastError: undefined,
    };
    this.addLog('Manual LLM retry requested.');
  }

  configureLLM(config: LLMRuntimeConfig | undefined): void {
    this.llmClient.configure(config);
    this.retryLLM();
  }

  testLLM(config: LLMRuntimeConfig | undefined): void {
    if (config) {
      this.llmClient.configure(config);
    }

    this.llmUnavailable = false;
    this.llmStatus = {
      ...this.llmStatus,
      mode: 'Fallback',
      lastCall: 'Testing LLM proxy...',
      lastLatencyMs: 0,
      lastPromptType: 'test',
      lastResultSummary: 'Waiting for /api/llm/health and /api/llm/test.',
      lastFailureReason: '',
      lastError: undefined,
    };

    this.llmClient
      .health()
      .then(({ data }) => {
        this.llmStatus = {
          ...this.llmStatus,
          lastCall: data.configured ? 'LLM proxy health OK.' : 'LLM proxy running without an API key.',
          lastResultSummary: `${data.message} Default ${data.defaultModel} @ ${data.defaultBaseUrl}`,
        };
        return this.llmClient.test(config);
      })
      .then(({ data, latencyMs }) => {
        this.llmUnavailable = false;
        this.llmStatus = {
          ...this.llmStatus,
          mode: 'Connected',
          lastCall: 'LLM test succeeded.',
          lastLatencyMs: latencyMs,
          lastPromptType: 'test',
          lastResultSummary: data.message || 'DeepSeek test response returned JSON.',
          lastFailureReason: '',
          lastError: undefined,
        };
        this.addLog('LLM test succeeded.');
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.llmUnavailable = true;
        this.llmStatus = {
          ...this.llmStatus,
          mode: message.includes('offline') || message.includes('missing') || message.includes('not_configured') ? 'Fallback' : 'Error',
          lastCall: 'LLM test failed.',
          lastLatencyMs: 0,
          lastPromptType: 'test',
          lastFailureReason: message,
          lastError: message,
          fallbackCount: this.llmStatus.fallbackCount + 1,
        };
        this.addLog(`LLM test failed: ${message.slice(0, 120)}`);
      });
  }

  reset(): void {
    const playerProfile = this.player.profile;
    const wasStarted = this.started;
    this.agents = cloneAgents();
    this.events = [];
    this.logs = [];
    this.selectedAgentId = undefined;
    this.player = createPlayerState(playerProfile);
    this.started = wasStarted;
    this.timeMinutes = 8 * 60;
    this.paused = false;
    this.timeScale = 1;
    this.elapsedMs = 0;
    this.llmStatus = initialLLMStatus();
    this.pendingLLMPlans.clear();
    this.pendingLLMDialogues.clear();
    this.pendingLLMReflections.clear();
    this.lastLLMAttemptMs.clear();
    this.loggedLLMFailures.clear();
    this.reflectionSourceKeys.clear();
    this.pathFailureKeys.clear();
    this.pathCache.clear();
    this.replayRecorder.clear();
    this.llmUnavailable = false;
    this.lastInteractionHintMs = -Infinity;
    this.lastQuestCheckMs = -Infinity;
    if (this.started) {
      this.seedBuiltInEvents();
      this.addLog('Simulation reset to 08:00.');
      this.agents.forEach((agent) => {
        remember(agent, `${agent.name} restarted the day as a ${agent.role}.`, this.timeMinutes, 'observation', 1, [
          'setup',
        ]);
        if (agent.mobility === 'counterBound') {
          this.lockCounterAgent(agent);
        } else {
          this.computePathToDestination(agent);
        }
      });
    } else {
      this.agents = [];
      this.addLog('Create your player to start the town simulation.');
    }
    this.updatePlayerInteractionHint(true);
  }

  triggerDemoEvent(): WorldEvent {
    if (!this.started) {
      this.addLog('Create a player before triggering the demo event.');
      return this.parsePlayerEvent(PLAYER_GATHERING_TEXT);
    }

    const event = this.addPlayerEvent('18:00 Town Square has a music party');
    this.selectedAgentId = 'nora';
    this.agents.forEach((agent) => {
      agent.nextDecisionIn = Math.min(agent.nextDecisionIn, 0.2);
    });
    this.addLog('Demo Event injected and Nora selected for Agent Loop inspection.');
    return event;
  }

  fastForwardToDemoEventLead(): void {
    if (!this.started) {
      this.addLog('Create a player before fast-forwarding the simulation.');
      return;
    }

    this.timeMinutes = parseTimeToMinutes('17:50');
    this.paused = false;
    this.agents.forEach((agent) => {
      agent.nextDecisionIn = 0.1;
      this.computePathToDestination(agent);
    });
    this.addLog('Fast forwarded to 17:50 for the 18:00 gathering demo.');
  }

  startWorld(input: PlayerProfileInput): void {
    const profile: PlayerProfile = {
      ...defaultPlayerProfile(),
      ...input,
      name: input.name?.trim() || 'Player',
      personalityTags: input.personalityTags?.length ? input.personalityTags : ['curious', 'social'],
      objective: input.objective?.trim() || 'Organize Evening Gathering',
      spawnLocation: input.spawnLocation ?? 'townSquare',
      appearance: input.appearance ?? defaultPlayerProfile().appearance,
    };
    const stats: PlayerStats = {
      ...defaultPlayerStats(),
      ...input.stats,
    };
    this.player = createPlayerState(profile, {
      energy: clampStat(stats.energy),
      social: clampStat(stats.social),
      hunger: clampStat(stats.hunger),
      reputation: clampStat(stats.reputation),
      curiosity: clampStat(stats.curiosity),
    });
    this.started = true;
    this.agents = cloneAgents();
    this.events = [];
    this.logs = [];
    this.selectedAgentId = undefined;
    this.timeMinutes = 8 * 60;
    this.elapsedMs = 0;
    this.pathFailureKeys.clear();
    this.pathCache.clear();
    this.reflectionSourceKeys.clear();
    this.seedBuiltInEvents();
    this.addLog(`${this.player.profile.name} entered town at ${LOCATION_BY_ID[profile.spawnLocation].name}.`);
    this.addLog(`Town simulation started with ${this.agents.length} NPCs.`);
    this.agents.forEach((agent) => {
      remember(agent, `${agent.name} started the day as a ${agent.role}.`, this.timeMinutes, 'observation', 1, [
        'setup',
      ]);
      if (agent.mobility === 'counterBound') {
        this.lockCounterAgent(agent);
      } else {
        this.computePathToDestination(agent);
      }
    });
    this.updatePlayerInteractionHint(true);
  }

  createPlayer(input: PlayerProfileInput): void {
    this.startWorld(input);
  }

  updatePlayerMovement(input: PlayerMovementInput, deltaSeconds: number): void {
    if (!this.started) {
      this.player.isMoving = false;
      this.player.animationState = `idle-${this.player.facing}`;
      return;
    }

    const magnitude = Math.hypot(input.x, input.y);
    if (magnitude <= 0.01) {
      this.player.isMoving = false;
      this.player.animationState = `idle-${this.player.facing}`;
      this.updatePlayerInteractionHint(false);
      return;
    }

    const normalizedX = input.x / magnitude;
    const normalizedY = input.y / magnitude;
    const canRun = input.running && this.player.stats.energy > 8;
    const speed = canRun ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
    const step = speed * deltaSeconds;

    this.player.facing =
      Math.abs(normalizedX) > Math.abs(normalizedY)
        ? normalizedX > 0
          ? 'right'
          : 'left'
        : normalizedY > 0
          ? 'down'
          : 'up';
    this.player.isMoving = true;
    this.player.animationState = `walk-${this.player.facing}`;

    this.movePlayerAxis('x', normalizedX * step);
    this.movePlayerAxis('y', normalizedY * step);

    const cost = (canRun ? 1.9 : 0.55) * deltaSeconds;
    this.player.stats.energy = clampStat(this.player.stats.energy - cost);
    this.player.stats.hunger = clampStat(this.player.stats.hunger - 0.22 * deltaSeconds);
    this.updatePlayerInteractionHint(false);
  }

  tryPlayerInteract(): void {
    if (!this.started) {
      return;
    }

    const hint = this.player.interactionHint;
    if (hint.kind === 'npc' && hint.targetId) {
      this.openPlayerDialogue(hint.targetId);
      return;
    }

    if (hint.kind === 'event' && hint.targetId) {
      const event = this.events.find((candidate) => candidate.id === hint.targetId);
      if (!event) {
        return;
      }
      this.addLog(`${this.player.profile.name} inspected event marker: ${event.description}.`);
      this.player.stats.curiosity = clampStat(this.player.stats.curiosity + 4);
      return;
    }

    if (hint.kind === 'building' && hint.locationId) {
      this.interactWithBuilding(hint.locationId);
      return;
    }
  }

  openPlayerDialogue(agentId: string): void {
    const agent = this.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return;
    }

    this.selectedAgentId = agent.id;
    this.recordPlayerTalk(agent);
    const openingLine = `${agent.name}: I am ${agent.currentAction}. What do you want to know?`;
    this.lockAgentForPlayerDialogue(agent);
    this.player.dialogue = {
      npcId: agent.id,
      npcLine: openingLine,
      playerIntent: 'Opening conversation',
      npcIntent: 'Respond to the player',
      options: PLAYER_DIALOGUE_OPTIONS,
      awaitingLLM: false,
      turns: [
        {
          speaker: 'npc',
          text: openingLine,
          timeLabel: this.timeLabel,
        },
      ],
    };
  }

  closePlayerDialogue(): void {
    const dialogue = this.player.dialogue;
    if (dialogue) {
      const agent = this.agents.find((candidate) => candidate.id === dialogue.npcId);
      if (agent) {
        agent.currentAction = agent.plannedAction || agent.currentAction;
        agent.lastAction = `Finished talking with ${this.player.profile.name}.`;
        agent.nextDecisionIn = Math.min(agent.nextDecisionIn, 0.2);
        agent.isMoving = false;
        agent.animationState = `idle-${agent.facing}`;
      }
    }
    this.player.dialogue = undefined;
    this.updatePlayerInteractionHint(true);
  }

  openTrade(agentId: string): TradeResult {
    const agent = this.agents.find((candidate) => candidate.id === agentId);
    if (!agent?.tradeProfile?.enabled) {
      return {
        ok: false,
        message: 'This NPC does not have a trade interface yet.',
      };
    }

    const result: TradeResult = {
      ok: true,
      message: `${agent.name}'s ${agent.tradeProfile.displayName} trade interface is reserved for the next economy pass.`,
      profile: agent.tradeProfile,
    };
    this.addLog(result.message);
    return result;
  }

  handlePlayerDialogue(optionId?: PlayerDialogueOptionId, playerMessage = ''): void {
    const dialogue = this.player.dialogue;
    if (!dialogue || dialogue.awaitingLLM) {
      return;
    }

    const agent = this.agents.find((candidate) => candidate.id === dialogue.npcId);
    if (!agent) {
      this.closePlayerDialogue();
      return;
    }

    const cleanMessage = playerMessage.trim();
    const playerTurnText = this.describePlayerDialogueInput(optionId, cleanMessage);
    const fallback = this.buildFallbackPlayerDialogue(agent, optionId, cleanMessage);
    const nextTurns = [
      ...dialogue.turns,
      {
        speaker: 'player' as const,
        text: playerTurnText,
        timeLabel: this.timeLabel,
      },
    ].slice(-6);
    this.player.dialogue = {
      ...dialogue,
      awaitingLLM: true,
      npcLine: `${agent.name} is thinking...`,
      playerIntent: playerTurnText,
      turns: nextTurns,
    };

    this.requestLLMPlayerDialogue(agent, optionId, cleanMessage, fallback, nextTurns);
  }

  update(deltaMs: number): void {
    if (!this.started) {
      this.logs = this.logs.slice(0, 30);
      return;
    }

    this.updatePlayerInteractionHint(false);
    this.tryCompletePlayerQuest(false);

    if (this.paused) {
      return;
    }

    this.elapsedMs += deltaMs;
    const deltaSeconds = deltaMs / 1000;
    const deltaVirtualMinutes = deltaSeconds * VIRTUAL_MINUTES_PER_SECOND * this.timeScale;
    this.timeMinutes = (this.timeMinutes + deltaVirtualMinutes) % DAY_MINUTES;

    for (const agent of this.agents) {
      agent.conversationCooldown = Math.max(0, agent.conversationCooldown - deltaSeconds);
      this.updateNeeds(agent, deltaVirtualMinutes);

      if (this.isAgentInPlayerDialogue(agent.id)) {
        this.lockAgentForPlayerDialogue(agent);
        continue;
      }

      if (this.updatePlayerDirective(agent)) {
        this.moveAgent(agent, deltaSeconds);
        this.updateMood(agent);
        this.updateNextPlan(agent);
        continue;
      }

      agent.nextDecisionIn -= deltaSeconds;
      if (agent.nextDecisionIn <= 0) {
        this.runAgentLoop(agent);
        agent.nextDecisionIn = 3.5 + Math.random() * 2.5;
      }

      this.moveAgent(agent, deltaSeconds);
      this.act(agent, deltaVirtualMinutes);
      this.updateMood(agent);
      this.updateNextPlan(agent);
    }

    this.tryConversations();
    this.tryGroupEvents();
    this.tryCompletePlayerQuest(false);
    this.logs = this.logs.slice(0, 30);
  }

  private isAgentInPlayerDialogue(agentId: string): boolean {
    return this.player.dialogue?.npcId === agentId;
  }

  private lockAgentForPlayerDialogue(agent: Agent): void {
    agent.isMoving = false;
    agent.animationState = `idle-${agent.facing}`;
    agent.currentAction = `talking with ${this.player.profile.name}`;
    agent.lastAction = `Talking with ${this.player.profile.name}; movement paused.`;
  }

  private updatePlayerDirective(agent: Agent): boolean {
    const directive = agent.playerDirective;
    if (directive?.kind !== 'followPlayer') {
      return false;
    }

    if (agent.mobility === 'counterBound') {
      agent.playerDirective = undefined;
      this.lockCounterAgent(agent);
      this.addLog(`${agent.name} cannot follow ${this.player.profile.name} because they must stay at the counter.`);
      return true;
    }

    if (this.timeMinutes > directive.untilMinutes) {
      agent.playerDirective = undefined;
      agent.nextDecisionIn = 0.1;
      agent.currentPath = [];
      agent.pathIndex = 0;
      agent.currentAction = agent.plannedAction;
      agent.lastAction = `Stopped following ${this.player.profile.name}.`;
      this.addLog(`${agent.name} stopped following ${this.player.profile.name} and returned to normal planning.`);
      return false;
    }

    const targetCell = nearestWalkableCell(worldToCell(this.player.position));
    const targetKey = `${targetCell.x},${targetCell.y}`;
    const distanceToPlayer = Math.hypot(agent.position.x - this.player.position.x, agent.position.y - this.player.position.y);
    const pathDone = agent.currentPath.length === 0 || agent.pathIndex >= agent.currentPath.length;
    const shouldRepath =
      distanceToPlayer > FOLLOW_PLAYER_DISTANCE &&
      (pathDone || directive.lastTargetCellKey !== targetKey || distanceToPlayer > FOLLOW_PLAYER_DISTANCE + FOLLOW_PLAYER_REPATH_DISTANCE);

    if (shouldRepath) {
      const startCell = nearestWalkableCell(worldToCell(agent.position));
      const cacheKey = `follow:${agent.id}:${startCell.x},${startCell.y}->${targetKey}`;
      const path = this.pathCache.get(cacheKey) ?? findPath(this.pathfindingGrid, startCell, targetCell);
      if (!this.pathCache.has(cacheKey)) {
        this.pathCache.set(cacheKey, path);
      }

      agent.currentPath = path;
      agent.pathIndex = path.length > 1 ? 1 : 0;
      agent.pathStatus = path.length
        ? `Following ${this.player.profile.name}: A* path has ${path.length} cells.`
        : `Cannot find a path to follow ${this.player.profile.name}.`;
      directive.lastTargetCellKey = targetKey;
    }

    if (distanceToPlayer <= FOLLOW_PLAYER_DISTANCE) {
      agent.isMoving = false;
      agent.animationState = `idle-${agent.facing}`;
      agent.currentAction = `staying near ${this.player.profile.name}`;
      agent.lastAction = `Waiting near ${this.player.profile.name}.`;
      return true;
    }

    agent.currentGoal = `Follow ${this.player.profile.name}`;
    agent.plannedAction = `following ${this.player.profile.name}`;
    agent.currentAction = `following ${this.player.profile.name}`;
    agent.reason = directive.reason;
    agent.lastPlan = `Player instruction: ${directive.reason}`;
    agent.nextPlan = `Following ${this.player.profile.name}; normal planning is paused.`;
    return true;
  }

  addPlayerEvent(message: string): WorldEvent {
    if (!this.started) {
      const event = this.parsePlayerEvent(message);
      this.addLog('Create a player before broadcasting events to NPCs.');
      return event;
    }

    const event = this.parsePlayerEvent(message);
    this.events.unshift(event);
    this.replayRecorder.recordEvent(event);
    const displayLogs = [`Player broadcasted: ${event.description}.`];

    for (const agent of this.agents) {
      const tags = ['player-event', event.id, event.locationId];
      if (isAgentInterestedInEvent(agent, event)) {
        event.interestedAgentIds.push(agent.id);
        agent.interestedEventIds.push(event.id);
        agent.lastObservation = `Player broadcasted "${event.description}" and I am interested.`;
        remember(
          agent,
          `Heard about ${event.title} at ${LOCATION_BY_ID[event.locationId].name}.`,
          this.timeMinutes,
          'event',
          4,
          tags,
        );
        displayLogs.push(`${agent.name} became interested in the event.`);
        this.applyPlan(agent, this.planningEngine.planFromEvent(agent, event), { logPlan: false, source: 'rule' });
        displayLogs.push(`${agent.name} changed plan to ${this.describeEventPlanChange(agent)}.`);
      } else {
        agent.lastObservation = `Player broadcasted "${event.description}", but I am not prioritizing it.`;
        remember(
          agent,
          `Noted ${event.title}, but it does not fit my current role or needs.`,
          this.timeMinutes,
          'event',
          2,
          tags,
        );
        displayLogs.push(`${agent.name} recorded the event but kept the current plan.`);
      }

      agent.nextDecisionIn = Math.min(agent.nextDecisionIn, 0.5);
    }

    this.addLogsInDisplayOrder(displayLogs);
    return event;
  }

  private canPlayerOccupy(position: { x: number; y: number }): boolean {
    const samplePoints = [
      position,
      { x: position.x - PLAYER_RADIUS, y: position.y },
      { x: position.x + PLAYER_RADIUS, y: position.y },
      { x: position.x, y: position.y - PLAYER_RADIUS },
      { x: position.x, y: position.y + PLAYER_RADIUS },
      { x: position.x - PLAYER_RADIUS, y: position.y + PLAYER_RADIUS },
      { x: position.x + PLAYER_RADIUS, y: position.y + PLAYER_RADIUS },
    ];

    return samplePoints.every((point) => {
      const cell = worldToCell(point);
      return isWalkableCell(cell.x, cell.y);
    });
  }

  private movePlayerAxis(axis: 'x' | 'y', amount: number): void {
    if (Math.abs(amount) <= 0.001) {
      return;
    }

    const steps = Math.max(1, Math.ceil(Math.abs(amount) / PLAYER_MAX_COLLISION_STEP));
    const step = amount / steps;
    for (let index = 0; index < steps; index += 1) {
      const nextPosition = {
        x: this.player.position.x + (axis === 'x' ? step : 0),
        y: this.player.position.y + (axis === 'y' ? step : 0),
      };
      if (!this.canPlayerOccupy(nextPosition)) {
        break;
      }
      this.player.position = nextPosition;
    }
  }

  private updatePlayerInteractionHint(force = false): void {
    const movedDistance = Number.isFinite(this.lastInteractionHintPosition.x)
      ? worldDistance(this.player.position, this.lastInteractionHintPosition)
      : Infinity;
    if (!force && this.elapsedMs - this.lastInteractionHintMs < 150 && movedDistance < 8) {
      return;
    }

    this.lastInteractionHintMs = this.elapsedMs;
    this.lastInteractionHintPosition = { ...this.player.position };

    if (this.player.dialogue) {
      this.player.interactionHint = {
        kind: 'none',
        label: 'Conversation open.',
      };
      return;
    }

    const nearestAgent = this.getNearestAgentToPlayer(PLAYER_INTERACTION_DISTANCE);
    if (nearestAgent) {
      this.player.interactionHint = {
        kind: 'npc',
        targetId: nearestAgent.id,
        label: `Press E to talk with ${nearestAgent.name}`,
      };
      return;
    }

    const nearbyEvent = this.getNearestEventToPlayer();
    if (nearbyEvent) {
      this.player.interactionHint = {
        kind: 'event',
        targetId: nearbyEvent.id,
        locationId: nearbyEvent.locationId,
        label: `Press E to inspect ${nearbyEvent.title}`,
      };
      return;
    }

    const nearbyEntrance = this.getNearestBuildingEntranceToPlayer();
    if (nearbyEntrance) {
      this.player.interactionHint = {
        kind: 'building',
        locationId: nearbyEntrance.id,
        label: `Press E to enter/use ${nearbyEntrance.name}`,
      };
      return;
    }

    this.player.interactionHint = {
      kind: 'none',
      label: 'Move near an NPC, event marker, or building entrance.',
    };
  }

  private getNearestAgentToPlayer(maxDistance: number): Agent | undefined {
    return this.agents
      .map((agent) => ({ agent, distance: pointDistance(this.player, agent) }))
      .filter((entry) => entry.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)[0]?.agent;
  }

  private getNearestEventToPlayer(): WorldEvent | undefined {
    return this.events
      .map((event) => ({
        event,
        distance: worldDistance(this.player.position, locationTargetWorld(event.locationId)),
      }))
      .filter((entry) => entry.distance <= PLAYER_EVENT_DISTANCE)
      .sort((a, b) => a.distance - b.distance)[0]?.event;
  }

  private getNearestBuildingEntranceToPlayer(): TownLocation | undefined {
    return LOCATIONS
      .map((location) => ({
        location,
        distance: worldDistance(this.player.position, locationEntranceWorld(location.id)),
      }))
      .filter((entry) => entry.distance <= PLAYER_BUILDING_DISTANCE)
      .sort((a, b) => a.distance - b.distance)[0]?.location;
  }

  private lockCounterAgent(agent: Agent): void {
    const anchor = agent.counterAnchor ?? (agent.homeLocationId ? this.getCounterAnchor(agent.homeLocationId) : undefined);
    if (!anchor) {
      return;
    }

    agent.position = { ...anchor };
    agent.currentPath = [];
    agent.pathIndex = 0;
    agent.destination = agent.homeLocationId ?? agent.destination;
    agent.isMoving = false;
    agent.animationState = `idle-${agent.facing}`;
    agent.pathStatus = `Fixed at the ${LOCATION_BY_ID[agent.destination].name} counter.`;
  }

  private interactWithBuilding(locationId: LocationId): void {
    const location = LOCATION_BY_ID[locationId];
    if (locationId === 'cafe' || locationId === 'restaurant' || locationId === 'grocery' || locationId === 'bakery') {
      this.player.stats.hunger = clampStat(this.player.stats.hunger + 24);
      this.player.stats.social = clampStat(this.player.stats.social + 5);
      this.addLog(`${this.player.profile.name} got food at ${location.name}. Hunger recovered.`);
      return;
    }

    if (locationId === 'home' || locationId === 'inn') {
      this.player.stats.energy = clampStat(this.player.stats.energy + 20);
      this.addLog(`${this.player.profile.name} rested at ${location.name}. Energy recovered.`);
      return;
    }

    if (locationId === 'library' || locationId === 'school' || locationId === 'studio' || locationId === 'museum') {
      this.player.stats.curiosity = clampStat(this.player.stats.curiosity + 8);
      this.addLog(`${this.player.profile.name} explored ${location.name} and found useful local context.`);
      return;
    }

    if (locationId === 'workshop' || locationId === 'postOffice') {
      this.player.stats.reputation = clampStat(this.player.stats.reputation + 4);
      this.player.stats.curiosity = clampStat(this.player.stats.curiosity + 4);
      this.addLog(`${this.player.profile.name} helped at ${location.name} and learned more about town routines.`);
      return;
    }

    if (locationId === 'park' || locationId === 'dock') {
      this.player.stats.energy = clampStat(this.player.stats.energy + 5);
      this.player.stats.curiosity = clampStat(this.player.stats.curiosity + 4);
      this.addLog(`${this.player.profile.name} looked around ${location.name}.`);
      return;
    }

    this.addLog(`${this.player.profile.name} visited ${location.name}.`);
  }

  private recordPlayerTalk(agent: Agent): void {
    if (!this.player.quest.talkedNpcIds.includes(agent.id)) {
      this.player.quest.talkedNpcIds.push(agent.id);
    }

    this.player.stats.social = clampStat(this.player.stats.social + 6);
    this.adjustPlayerRelationship(agent, { familiarity: 5, trust: 1, affinity: 1 });
    remember(
      agent,
      `${this.player.profile.name} started a conversation with me near ${this.agentLocation(agent).name}.`,
      this.timeMinutes,
      'conversation',
      2,
      ['player-conversation'],
      ['player'],
    );
  }

  private describePlayerDialogueInput(optionId?: PlayerDialogueOptionId, playerMessage = ''): string {
    const cleanMessage = playerMessage.trim();
    if (cleanMessage) {
      return cleanMessage;
    }

    const option = PLAYER_DIALOGUE_OPTIONS.find((candidate) => candidate.id === optionId);
    return option?.label ?? 'Talk';
  }

  private isFollowPlayerRequest(text = ''): boolean {
    const lower = text.toLowerCase();
    const englishFollow = /follow me|follow the player|come with me|go with me|walk with me|come along|stay with me/.test(lower);
    const asksToMoveTogether = /跟|随|陪|一起|一块|同行|同去/.test(text);
    const refersToPlayer = /我|玩家|player/.test(text);
    const asksReturnTogether = /回家|回去|回到家/.test(text) && /跟|随|陪|一起|一块|带|来/.test(text);
    return englishFollow || (asksToMoveTogether && refersToPlayer) || asksReturnTogether;
  }

  private inferDirectiveTargetLocation(text = ''): LocationId | undefined {
    if (/家|回家|home/i.test(text)) {
      return 'home';
    }

    return findLocationByText(text)?.id;
  }

  private normalizeLocationId(value?: string): LocationId | undefined {
    if (!value) {
      return undefined;
    }

    if (Object.keys(LOCATION_BY_ID).includes(value)) {
      return value as LocationId;
    }

    return this.inferDirectiveTargetLocation(value);
  }

  private buildFallbackPlayerDialogue(
    agent: Agent,
    optionId?: PlayerDialogueOptionId,
    playerMessage = '',
  ): LLMPlayerDialogueResult {
    const latestMemory = agent.memories[0]?.summary ?? 'I am still forming impressions about today.';
    const currentEvent = this.findPlayerGatheringEvent();
    const eventPlace = currentEvent ? LOCATION_BY_ID[currentEvent.locationId].name : 'Town Square';

    if (optionId === 'ask-plan') {
      return {
        npcLine: `${agent.name}: I am ${agent.currentAction} because ${agent.reason}`,
        playerIntent: 'Ask NPC current plan',
        npcIntent: 'Explain current plan',
        relationshipDelta: { familiarity: 1, trust: 1, affinity: 0 },
        memoryToWrite: `${this.player.profile.name} asked about my current plan.`,
      };
    }

    if (optionId === 'tell-event') {
      return {
        npcLine: `${agent.name}: Thanks, I will remember the gathering at ${eventPlace}.`,
        playerIntent: 'Tell NPC about a town event',
        npcIntent: 'Record event information',
        relationshipDelta: { familiarity: 2, trust: 1, affinity: 1 },
        memoryToWrite: `${this.player.profile.name} told me about a music party at ${eventPlace}.`,
      };
    }

    if (optionId === 'invite-event') {
      return {
        npcLine: `${agent.name}: I can come by and see what happens.`,
        playerIntent: 'Invite NPC to the evening gathering',
        npcIntent: 'Consider attending the event',
        relationshipDelta: { familiarity: 3, trust: 2, affinity: 2 },
        memoryToWrite: `${this.player.profile.name} invited me to the evening gathering.`,
        possiblePlanChange: {
          destination: 'townSquare',
          goal: 'Attend the player-organized evening gathering',
          action: 'joining the player gathering',
          reason: `I was invited by ${this.player.profile.name}, so I will go to Town Square.`,
        },
      };
    }

    if (optionId === 'ask-memory') {
      return {
        npcLine: `${agent.name}: The latest thing I remember is: ${latestMemory}`,
        playerIntent: 'Ask NPC what they remember',
        npcIntent: 'Share a recent memory',
        relationshipDelta: { familiarity: 1, trust: 1, affinity: 0 },
        memoryToWrite: `${this.player.profile.name} asked me to recall my latest memory.`,
      };
    }

    const eventLike = /party|gathering|music|invite|town square|event/i.test(playerMessage);
    const followLike = this.isFollowPlayerRequest(playerMessage);
    return {
      npcLine: eventLike
        ? `${agent.name}: That sounds important. I will keep the event in mind.`
        : followLike
          ? `${agent.name}: I will follow you. Lead the way.`
        : `${agent.name}: I see. That may affect what I do next.`,
      playerIntent: playerMessage || 'Free-form conversation',
      npcIntent: followLike ? 'Follow the player as requested' : eventLike ? 'Evaluate a player-mentioned event' : 'Respond to player conversation',
      relationshipDelta: { familiarity: 2, trust: 1, affinity: 1 },
      memoryToWrite: `${this.player.profile.name} said: ${playerMessage || 'hello'}`,
      possiblePlanChange: followLike
        ? {
            followPlayer: true,
            targetLocation: this.inferDirectiveTargetLocation(playerMessage) ?? 'home',
            goal: `Follow ${this.player.profile.name}`,
            action: `following ${this.player.profile.name}`,
            reason: `${this.player.profile.name} asked me to follow them.`,
          }
        : undefined,
    };
  }

  private requestLLMPlayerDialogue(
    agent: Agent,
    optionId: PlayerDialogueOptionId | undefined,
    playerMessage: string,
    fallback: LLMPlayerDialogueResult,
    conversationTurns: NonNullable<PlayerState['dialogue']>['turns'],
  ): void {
    const key = `player:${agent.id}`;
    if (this.pendingLLMDialogues.has(key)) {
      return;
    }

    if (this.llmUnavailable) {
      this.applyPlayerDialogueResult(agent, fallback, optionId, playerMessage, 'fallback');
      return;
    }

    this.pendingLLMDialogues.add(key);
    this.beginLLMCall('dialogue', `Player dialogue with ${agent.name}`);

    this.llmClient
      .playerDialogue({
        player: {
          profile: this.player.profile,
          stats: this.player.stats,
        },
        npc: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          personality: agent.personality,
          currentGoal: agent.currentGoal,
          currentAction: agent.currentAction,
          reason: agent.reason,
          mobility: agent.mobility,
          homeLocationId: agent.homeLocationId,
          needs: agent.needs,
          reflection: agent.reflection,
          memories: agent.memories.slice(0, 5),
        },
        timeLabel: this.timeLabel,
        locationName: this.agentLocation(agent).name,
        optionId,
        playerMessage,
        conversationTurns,
        recentEvents: this.events.slice(0, 3),
      })
      .then(({ data, latencyMs }) => {
        const normalized = this.normalizePlayerDialogue(data, fallback);
        this.applyPlayerDialogueResult(agent, normalized, optionId, playerMessage, 'llm');
        this.markLLMSuccess('dialogue', `Player dialogue generated for ${agent.name}`, latencyMs, normalized.npcLine);
      })
      .catch((error) => {
        this.markLLMFailure('dialogue', `Template player dialogue for ${agent.name}`, error, false);
        this.applyPlayerDialogueResult(agent, fallback, optionId, playerMessage, 'fallback');
      })
      .finally(() => {
        this.pendingLLMDialogues.delete(key);
      });
  }

  private normalizePlayerDialogue(
    data: LLMPlayerDialogueResult,
    fallback: LLMPlayerDialogueResult,
  ): LLMPlayerDialogueResult {
    return {
      npcLine: data.npcLine?.trim() || fallback.npcLine,
      playerIntent: data.playerIntent?.trim() || fallback.playerIntent,
      npcIntent: data.npcIntent?.trim() || fallback.npcIntent,
      relationshipDelta: {
        familiarity: this.clampRelationshipDelta(data.relationshipDelta?.familiarity ?? fallback.relationshipDelta?.familiarity ?? 0),
        trust: this.clampRelationshipDelta(data.relationshipDelta?.trust ?? fallback.relationshipDelta?.trust ?? 0),
        affinity: this.clampRelationshipDelta(data.relationshipDelta?.affinity ?? fallback.relationshipDelta?.affinity ?? 0),
      },
      memoryToWrite: data.memoryToWrite?.trim() || fallback.memoryToWrite,
      possiblePlanChange: data.possiblePlanChange ?? fallback.possiblePlanChange,
    };
  }

  private applyPlayerDialogueResult(
    agent: Agent,
    result: LLMPlayerDialogueResult,
    optionId: PlayerDialogueOptionId | undefined,
    playerMessage: string,
    source: 'llm' | 'fallback',
  ): void {
    const npcLine = result.npcLine.trim() || `${agent.name}: I will remember that.`;
    const currentDialogue = this.player.dialogue;
    if (currentDialogue?.npcId === agent.id) {
      const turns = [
        ...currentDialogue.turns,
        {
          speaker: 'npc' as const,
          text: npcLine,
          timeLabel: this.timeLabel,
        },
      ].slice(-8);
      this.player.dialogue = {
        ...currentDialogue,
        npcLine,
        playerIntent: result.playerIntent || currentDialogue.playerIntent,
        npcIntent: result.npcIntent || currentDialogue.npcIntent,
        awaitingLLM: false,
        turns,
      };
      this.replayRecorder.recordDialogue(
        ['player', agent.id],
        this.timeMinutes,
        `${this.player.profile.name} talked with ${agent.name}`,
        turns,
      );
    }

    agent.speechBubble = { text: npcLine.replace(`${agent.name}:`, '').trim(), expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
    agent.lastObservation = `${this.player.profile.name} talked to me: ${result.playerIntent}`;
    agent.lastLLMDecision = source === 'llm' ? `Player dialogue LLM intent: ${result.npcIntent}` : `Player dialogue fallback: ${result.npcIntent}`;
    this.player.stats.social = clampStat(this.player.stats.social + 8);
    this.adjustPlayerRelationship(agent, result.relationshipDelta ?? { familiarity: 1, trust: 0, affinity: 0 });

    if (result.memoryToWrite) {
      remember(agent, result.memoryToWrite, this.timeMinutes, 'conversation', 3, ['player-dialogue'], ['player']);
    }

    const acceptedFollowDirective = this.applyPlayerFollowDirective(agent, result, playerMessage, source);
    const event = acceptedFollowDirective ? undefined : this.applyPlayerEventFromDialogue(agent, optionId, playerMessage, result);
    const acceptedPlanChange = acceptedFollowDirective ? false : this.applyPlayerDialoguePlanChange(agent, result);

    if (optionId === 'invite-event' && event && !acceptedPlanChange) {
      this.inviteAgentToPlayerEvent(agent, event, source);
    }

    this.addLog(
      `${this.player.profile.name} talked with ${agent.name}: ${result.npcIntent || 'conversation updated NPC memory'}.`,
    );
  }

  private applyPlayerFollowDirective(
    agent: Agent,
    result: LLMPlayerDialogueResult,
    playerMessage: string,
    source: 'llm' | 'fallback',
  ): boolean {
    const planChange = result.possiblePlanChange;
    const wantsFollow =
      Boolean(planChange?.followPlayer) ||
      this.isFollowPlayerRequest(playerMessage) ||
      this.isFollowPlayerRequest(result.npcIntent) ||
      this.isFollowPlayerRequest(result.playerIntent);

    if (!wantsFollow) {
      return false;
    }

    if (agent.mobility === 'counterBound') {
      agent.lastObservation = `${this.player.profile.name} asked me to follow, but I must stay at my counter.`;
      agent.lastLLMDecision = `${source === 'llm' ? 'LLM' : 'Fallback'} follow request rejected by counter-bound rule.`;
      remember(
        agent,
        `${this.player.profile.name} asked me to follow them, but my counter duty prevents me from leaving.`,
        this.timeMinutes,
        'plan',
        3,
        ['player-command', 'follow-player', 'blocked'],
        ['player'],
      );
      this.addLog(`${agent.name} cannot follow ${this.player.profile.name}; counter-bound staff must stay at their post.`);
      return false;
    }

    const targetLocationId =
      this.normalizeLocationId(planChange?.targetLocation) ??
      this.normalizeLocationId(planChange?.destination) ??
      this.inferDirectiveTargetLocation(playerMessage);
    const targetName = targetLocationId ? LOCATION_BY_ID[targetLocationId].name : 'the player';
    const reason =
      planChange?.reason?.trim() ||
      (targetLocationId
        ? `${this.player.profile.name} asked me to follow them to ${targetName}.`
        : `${this.player.profile.name} asked me to follow them.`);

    agent.playerDirective = {
      kind: 'followPlayer',
      reason,
      startedAtMinutes: this.timeMinutes,
      untilMinutes: this.timeMinutes + FOLLOW_PLAYER_DURATION_MINUTES,
      targetLocationId,
    };
    agent.destination = targetLocationId ?? agent.destination;
    agent.currentGoal = planChange?.goal?.trim() || `Follow ${this.player.profile.name}`;
    agent.plannedAction = planChange?.action?.trim() || `following ${this.player.profile.name}`;
    agent.currentAction = `following ${this.player.profile.name}`;
    agent.reason = reason;
    agent.lastPlan = `Player instruction: ${reason}`;
    agent.nextPlan = `Following ${this.player.profile.name}; normal planning is paused.`;
    agent.currentPath = [];
    agent.pathIndex = 0;
    this.updatePlayerDirective(agent);

    remember(
      agent,
      `${this.player.profile.name} instructed me to follow them${targetLocationId ? ` to ${targetName}` : ''}.`,
      this.timeMinutes,
      'plan',
      4,
      ['player-command', 'follow-player'],
      ['player'],
    );
    this.addLog(`${agent.name} accepted a player instruction and is now following ${this.player.profile.name}.`);
    return true;
  }

  private applyPlayerEventFromDialogue(
    agent: Agent,
    optionId: PlayerDialogueOptionId | undefined,
    playerMessage: string,
    result: LLMPlayerDialogueResult,
  ): WorldEvent | undefined {
    const mentionsEvent =
      optionId === 'tell-event' ||
      optionId === 'invite-event' ||
      /party|gathering|music|town square|event|invite/i.test(playerMessage) ||
      /party|gathering|event|attend|invite/i.test(result.npcIntent);

    if (!mentionsEvent) {
      return undefined;
    }

    const event = this.getOrCreatePlayerGatheringEvent();
    const tags = ['player-event', event.id, event.locationId, 'player-told'];
    remember(
      agent,
      `${this.player.profile.name} told me about ${event.title} at ${LOCATION_BY_ID[event.locationId].name}.`,
      this.timeMinutes,
      'event',
      optionId === 'invite-event' ? 5 : 4,
      tags,
      ['player'],
    );

    if (!event.interestedAgentIds.includes(agent.id)) {
      event.interestedAgentIds.push(agent.id);
    }
    if (!agent.interestedEventIds.includes(event.id)) {
      agent.interestedEventIds.push(event.id);
    }

    if (optionId === 'tell-event' && isAgentInterestedInEvent(agent, event)) {
      this.applyPlan(agent, this.planningEngine.planFromEvent(agent, event), { source: 'rule' });
      this.addLog(`${agent.name} became interested after ${this.player.profile.name} mentioned ${event.title}.`);
    }

    return event;
  }

  private applyPlayerDialoguePlanChange(agent: Agent, result: LLMPlayerDialogueResult): boolean {
    const candidate = result.possiblePlanChange;
    if (!candidate?.destination || !Object.keys(LOCATION_BY_ID).includes(candidate.destination)) {
      return false;
    }

    const validation = this.planningEngine.validateLLMPlan({
      destination: candidate.destination,
      action: candidate.action || 'responding to player',
      goal: candidate.goal || 'Respond to player influence',
      reason: candidate.reason || `I changed plan after talking with ${this.player.profile.name}.`,
    });

    if (!validation.valid || !validation.plan) {
      return false;
    }

    this.applyPlan(agent, validation.plan, { source: 'llm' });
    this.addLog(`${agent.name} changed plan after player conversation: ${validation.plan.reason}`);

    if (candidate.destination === 'townSquare' && /gathering|party|event|invite/i.test(validation.plan.reason)) {
      this.recordPlayerInvite(agent);
    }

    return true;
  }

  private inviteAgentToPlayerEvent(agent: Agent, event: WorldEvent, source: 'llm' | 'fallback'): void {
    if (!event.interestedAgentIds.includes(agent.id)) {
      event.interestedAgentIds.push(agent.id);
    }
    if (!agent.interestedEventIds.includes(event.id)) {
      agent.interestedEventIds.push(event.id);
    }

    this.recordPlayerInvite(agent);
    const plan = this.planningEngine.planFromEvent(agent, event);
    this.applyPlan(
      agent,
      {
        ...plan,
        goal: `Attend ${this.player.profile.name}'s evening gathering`,
        action: agent.role === 'Journalist' || agent.role === 'Reporter' ? 'interviewing player-invited guests' : plan.action,
        reason: `I was invited by ${this.player.profile.name}, so I will go to ${LOCATION_BY_ID[event.locationId].name}.`,
        planSummary: `${this.player.profile.name} invited me; I should attend the gathering.`,
      },
      { source: source === 'llm' ? 'llm' : 'rule' },
    );
    this.addLog(`${agent.name} accepted ${this.player.profile.name}'s invitation to ${event.title}.`);
  }

  private recordPlayerInvite(agent: Agent): void {
    if (!this.player.quest.invitedNpcIds.includes(agent.id)) {
      this.player.quest.invitedNpcIds.push(agent.id);
      this.player.stats.reputation = clampStat(this.player.stats.reputation + 8);
    }
  }

  private getOrCreatePlayerGatheringEvent(): WorldEvent {
    const existing = this.findPlayerGatheringEvent();
    if (existing) {
      return existing;
    }

    return this.addPlayerEvent(PLAYER_GATHERING_TEXT);
  }

  private findPlayerGatheringEvent(): WorldEvent | undefined {
    return this.events.find(
      (event) =>
        event.source === 'player' &&
        event.locationId === 'townSquare' &&
        /music party|gathering|party/i.test(event.description),
    );
  }

  private adjustPlayerRelationship(
    agent: Agent,
    delta: { familiarity?: number; trust?: number; affinity?: number },
  ): void {
    const current = agent.relationships.player ?? { familiarity: 0, trust: 0, affinity: 0 };
    agent.relationships.player = {
      familiarity: clampStat(current.familiarity + (delta.familiarity ?? 0)),
      trust: clampStat(current.trust + (delta.trust ?? 0)),
      affinity: clampStat(current.affinity + (delta.affinity ?? 0)),
    };
  }

  private clampRelationshipDelta(value: number): number {
    return Math.max(-3, Math.min(3, Number.isFinite(value) ? value : 0));
  }

  private tryCompletePlayerQuest(force = false): void {
    if (this.player.quest.completed) {
      return;
    }

    if (!force && this.elapsedMs - this.lastQuestCheckMs < 600) {
      return;
    }

    this.lastQuestCheckMs = this.elapsedMs;
    const eventTime = parseTimeToMinutes('18:00');
    if (
      this.player.quest.talkedNpcIds.length < 2 ||
      this.player.quest.invitedNpcIds.length < 2 ||
      this.timeMinutes < eventTime
    ) {
      return;
    }

    const invitedParticipants = this.player.quest.invitedNpcIds
      .map((agentId) => this.agents.find((agent) => agent.id === agentId))
      .filter((agent): agent is Agent => Boolean(agent))
      .filter((agent) => this.agentLocation(agent).id === 'townSquare' || agent.destination === 'townSquare');

    if (invitedParticipants.length < 2) {
      return;
    }

    this.player.quest.completed = true;
    this.player.quest.completionMessage = `${this.player.profile.name} organized a visible evening gathering with ${invitedParticipants
      .map((agent) => agent.name)
      .join(', ')}.`;
    this.player.stats.reputation = clampStat(this.player.stats.reputation + 18);
    this.addLog(`Quest complete: ${this.player.quest.completionMessage}`);

    for (const agent of invitedParticipants) {
      remember(
        agent,
        `Joined ${this.player.profile.name}'s player-organized evening gathering at Town Square.`,
        this.timeMinutes,
        'event',
        5,
        ['player-quest', 'group-event'],
        ['player', ...invitedParticipants.filter((other) => other.id !== agent.id).map((other) => other.id)],
      );
      agent.speechBubble = {
        text: `I joined ${this.player.profile.name}'s gathering.`,
        expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS,
      };
    }
  }

  private parsePlayerEvent(message: string): WorldEvent {
    const timeMatch = message.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
    const location = findLocationByText(message) ?? LOCATION_BY_ID.townSquare;
    const timeMinutes = timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : Math.floor(this.timeMinutes);

    return {
      id: eventId(),
      title: extractEventTitle(message, location.name),
      description: message.trim() || 'A vague town event was announced.',
      timeMinutes,
      locationId: location.id,
      createdAtMinutes: Math.floor(this.timeMinutes),
      interestedAgentIds: [],
      source: 'player',
    };
  }

  private runAgentLoop(agent: Agent): void {
    this.ensureAgentDailyPlan(agent);
    if (agent.mobility === 'counterBound') {
      this.lockCounterAgent(agent);
    }
    const observation = this.observe(agent);
    agent.lastObservation = this.describeObservation(agent, observation);
    agent.retrievedMemories = this.retrieveMemories(agent, observation);

    this.tryReflect(agent);

    const fallbackPlan = this.constrainPlanForMobility(agent, this.planningEngine.planFromScheduleAndNeeds(agent, observation));
    this.applyPlan(agent, fallbackPlan, { source: 'rule' });
    if (agent.mobility === 'roaming') {
      this.requestLLMPlan(agent, observation, fallbackPlan);
    }
  }

  private ensureAgentDailyPlan(agent: Agent): void {
    if (agent.dailyPlan.length === 0) {
      agent.dailyPlan = this.planningEngine.buildDailyPlan(agent);
      remember(
        agent,
        `${agent.name}'s daily plan has ${agent.dailyPlan.length} scheduled activities.`,
        this.timeMinutes,
        'plan',
        3,
        ['daily-plan'],
      );
    }
  }

  private observe(agent: Agent): Observation {
    const nearbyAgents = this.agents.filter((other) => other.id !== agent.id && distance(agent, other) <= 110);
    const activeEvents = this.events.filter((event) => {
      const minutesFromEvent = Math.abs(event.timeMinutes - this.timeMinutes);
      return minutesFromEvent < 90 || Math.abs(minutesFromEvent - DAY_MINUTES) < 90;
    });

    return {
      timeMinutes: Math.floor(this.timeMinutes),
      timeLabel: this.timeLabel,
      nearbyAgents,
      activeEvents,
      allEvents: this.events,
    };
  }

  private retrieveMemories(agent: Agent, observation: Observation) {
    const query = [
      agent.lastObservation,
      observation.activeEvents.map((event) => event.description).join(' '),
      observation.nearbyAgents.map((nearbyAgent) => nearbyAgent.name).join(' '),
    ].join(' ');

    return memoryStore
      .retrieve(agent, {
        text: query,
        nowMinutes: Math.floor(this.timeMinutes),
        limit: 3,
      })
      .map((result) => result.memory);
  }

  private tryReflect(agent: Agent): void {
    const candidates = memoryStore
      .retrieve(agent, {
        minImportance: 4,
        nowMinutes: Math.floor(this.timeMinutes),
        limit: 5,
      })
      .map((result) => result.memory);
    const importanceTotal = candidates.reduce((total, memory) => total + memory.importance, 0);
    if (importanceTotal < REFLECTION_IMPORTANCE_THRESHOLD) {
      return;
    }

    const sourceKey = candidates.map((memory) => memory.id).join('|');
    if (!sourceKey || this.reflectionSourceKeys.get(agent.id) === sourceKey) {
      return;
    }

    this.reflectionSourceKeys.set(agent.id, sourceKey);
    const reflection = this.reflectionEngine.generate(agent, Math.floor(this.timeMinutes), {
      minImportance: 4,
      limit: 5,
    });
    if (!reflection) {
      return;
    }

    agent.reflection = reflection.summary;
    memoryStore.write(agent, {
      summary: `Reflection: ${reflection.summary}`,
      timeMinutes: this.timeMinutes,
      type: 'reflection',
      importance: 4,
      tags: ['reflection'],
      evidenceMemoryIds: reflection.sourceMemoryIds,
      embeddingText: [reflection.summary, ...reflection.focalQuestions, ...reflection.insights].join(' '),
    });
    this.replayRecorder.recordReflection(agent, this.timeMinutes, reflection.summary, candidates);
    this.addLog(`${agent.name} reflected: ${reflection.summary}`);
    this.requestLLMReflection(agent, candidates);
  }

  private seedBuiltInEvents(): void {
    const eveningGathering: WorldEvent = {
      id: 'system-evening-gathering',
      title: 'the evening gathering',
      description: '18:00 Town Square Evening Gathering',
      timeMinutes: parseTimeToMinutes('18:00'),
      locationId: 'townSquare',
      createdAtMinutes: Math.floor(this.timeMinutes),
      interestedAgentIds: [],
      source: 'system',
      groupInteractionDone: false,
    };

    for (const agent of this.agents) {
      if (isAgentInterestedInEvent(agent, eveningGathering)) {
        eveningGathering.interestedAgentIds.push(agent.id);
        agent.interestedEventIds.push(eveningGathering.id);
      }
    }

    this.events.unshift(eveningGathering);
  }

  private describeObservation(agent: Agent, observation: Observation): string {
    const location = this.agentLocation(agent);
    const nearbyNames = observation.nearbyAgents.map((nearbyAgent) => nearbyAgent.name).join(', ');
    const event = observation.activeEvents.find((activeEvent) => activeEvent.interestedAgentIds.includes(agent.id));
    const nearbyText = nearbyNames ? ` Nearby agents: ${nearbyNames}.` : ' No nearby agents.';
    const eventText = event ? ` I know about ${event.title} at ${LOCATION_BY_ID[event.locationId].name}.` : '';

    return `It is ${observation.timeLabel} and I am near ${location.name}.${nearbyText}${eventText}`;
  }

  private describeEventPlanChange(agent: Agent): string {
    if (agent.mobility === 'counterBound') return `stay at the ${LOCATION_BY_ID[agent.destination].name} counter`;
    if (agent.mobility === 'buildingBound') return `respond from inside ${LOCATION_BY_ID[agent.destination].name}`;
    if (agent.role === 'Journalist' || agent.role === 'Reporter') return 'interview people at the event';
    if (agent.role === 'Cafe Owner') return 'observe visitor flow at the event';
    return 'attend the event';
  }

  private constrainPlanForMobility(agent: Agent, plan: PlanResult): PlanResult {
    if (agent.mobility === 'roaming' || !agent.homeLocationId) {
      return plan;
    }

    const homeName = LOCATION_BY_ID[agent.homeLocationId].name;
    if (agent.mobility === 'counterBound') {
      return {
        ...plan,
        destination: agent.homeLocationId,
        action: plan.destination === agent.homeLocationId ? plan.action : `serving at the ${homeName} counter`,
        goal: `Stay available at ${homeName}`,
        reason:
          plan.destination === agent.homeLocationId
            ? plan.reason
            : `I noted that plan, but I must stay at the ${homeName} counter.`,
        planSummary: `Counter-bound staff remain at ${homeName}.`,
        mood: plan.mood,
      };
    }

    if (plan.destination === agent.homeLocationId) {
      return plan;
    }

    return {
      ...plan,
      destination: agent.homeLocationId,
      action: `responding from inside ${homeName}`,
      goal: `Handle the town situation without leaving ${homeName}`,
      reason: `I heard about something outside, but my work keeps me inside ${homeName}.`,
      planSummary: `Building-bound staff can react, but their movement stays inside ${homeName}.`,
    };
  }

  private applyPlan(
    agent: Agent,
    plan: PlanResult,
    options: { logPlan?: boolean; source?: 'rule' | 'llm' } = {},
  ): void {
    const constrainedPlan = this.constrainPlanForMobility(agent, plan);
    const destinationChanged = agent.destination !== constrainedPlan.destination;
    const goalChanged = agent.currentGoal !== constrainedPlan.goal;
    const logPlan = options.logPlan ?? true;
    const source = options.source ?? 'rule';

    agent.destination = constrainedPlan.destination;
    agent.currentGoal = constrainedPlan.goal;
    agent.plannedAction = constrainedPlan.action;
    agent.reason = constrainedPlan.reason;
    agent.lastPlan = source === 'llm' ? `LLM plan: ${constrainedPlan.planSummary}` : constrainedPlan.planSummary;
    agent.mood = constrainedPlan.mood;
    const scheduleEntry = agent.dailyPlan.find((entry) => entry.locationId === constrainedPlan.destination && entry.action === constrainedPlan.action);
    agent.currentTaskDecomposition = this.planningEngine.decomposeTask(
      constrainedPlan.action,
      scheduleEntry?.durationMinutes ?? 45,
    );

    if (agent.mobility === 'counterBound') {
      this.lockCounterAgent(agent);
    } else if (destinationChanged || goalChanged || agent.currentPath.length === 0) {
      this.computePathToDestination(agent);
    }

    if (destinationChanged || goalChanged) {
      const placeName = LOCATION_BY_ID[constrainedPlan.destination].name;
      agent.lastActionMemoryKey = undefined;
      remember(
        agent,
        `${agent.name} decided to go to ${placeName}: ${constrainedPlan.reason}`,
        this.timeMinutes,
        'plan',
        source === 'llm' ? 3 : 2,
        source === 'llm' ? ['plan', 'llm-plan'] : ['plan'],
      );
      if (logPlan) {
        this.addLog(`${agent.name} planned: ${constrainedPlan.reason}`);
      }
      this.replayRecorder.recordPlan(agent, this.timeMinutes);
    }
  }

  private computePathToDestination(agent: Agent): void {
    const startCell = nearestWalkableCell(worldToCell(agent.position));
    const goalCell = nearestWalkableCell(this.targetCellForAgent(agent));
    const cacheKey = `${startCell.x},${startCell.y}->${goalCell.x},${goalCell.y}`;
    const cachedPath = this.pathCache.get(cacheKey);
    const path = cachedPath ?? findPath(this.pathfindingGrid, startCell, goalCell);
    if (!cachedPath) {
      this.pathCache.set(cacheKey, path);
    }

    if (path.length > 0) {
      agent.currentPath = path;
      agent.pathIndex = path.length > 1 ? 1 : 0;
      agent.pathStatus = `A* path ready: ${path.length} cells to ${LOCATION_BY_ID[agent.destination].name}.`;
      return;
    }

    const fallbackKey = `${cacheKey}:fallback`;
    const cachedFallbackPath = this.pathCache.get(fallbackKey);
    const fallbackPath = cachedFallbackPath ?? this.findNearestReachablePath(startCell, goalCell);
    if (!cachedFallbackPath) {
      this.pathCache.set(fallbackKey, fallbackPath);
    }
    agent.currentPath = fallbackPath;
    agent.pathIndex = fallbackPath.length > 1 ? 1 : 0;
    agent.pathStatus = fallbackPath.length
      ? `Target blocked; using nearest reachable cell near ${LOCATION_BY_ID[agent.destination].name}.`
      : `No reachable path to ${LOCATION_BY_ID[agent.destination].name}.`;

    const keyForLog = `${agent.id}:${agent.destination}:${pathKey(agent)}`;
    if (!this.pathFailureKeys.has(keyForLog)) {
      this.pathFailureKeys.add(keyForLog);
      this.addLog(`${agent.name} could not reach the exact target, so A* selected the nearest reachable cell.`);
    }
  }

  private targetCellForAgent(agent: Agent): GridPoint {
    if (agent.mobility === 'counterBound') {
      return agent.counterAnchor ? worldToCell(agent.counterAnchor) : LOCATION_TARGETS[agent.destination];
    }

    if (agent.mobility === 'buildingBound' && agent.homeLocationId) {
      const points = BUILDING_ACTIVITY_POINTS[agent.homeLocationId] ?? [LOCATION_TARGETS[agent.homeLocationId]];
      return points[stableIndex(agent.id, points.length, Math.floor(this.timeMinutes / 90))];
    }

    return LOCATION_TARGETS[agent.destination];
  }

  private findNearestReachablePath(startCell: GridPoint, goalCell: GridPoint): GridPoint[] {
    for (let radius = 1; radius < Math.max(GRID_WIDTH, GRID_HEIGHT); radius += 1) {
      for (let y = goalCell.y - radius; y <= goalCell.y + radius; y += 1) {
        for (let x = goalCell.x - radius; x <= goalCell.x + radius; x += 1) {
          if (!isWalkableCell(x, y)) {
            continue;
          }
          const path = findPath(this.pathfindingGrid, startCell, { x, y });
          if (path.length > 0) {
            return path;
          }
        }
      }
    }

    return [];
  }

  private moveAgent(agent: Agent, deltaSeconds: number): void {
    if (agent.mobility === 'counterBound') {
      this.lockCounterAgent(agent);
      return;
    }

    if (agent.playerDirective?.kind === 'followPlayer' && (agent.currentPath.length === 0 || agent.pathIndex >= agent.currentPath.length)) {
      agent.isMoving = false;
      agent.animationState = `idle-${agent.facing}`;
      return;
    }

    if (agent.currentPath.length === 0 || agent.pathIndex >= agent.currentPath.length) {
      if (!this.isAtDestination(agent, agent.destination)) {
        this.computePathToDestination(agent);
      }
      agent.isMoving = false;
      agent.animationState = `idle-${agent.facing}`;
      return;
    }

    const targetCell = agent.currentPath[agent.pathIndex];
    const target = cellToWorld(targetCell);
    const dx = target.x - agent.position.x;
    const dy = target.y - agent.position.y;
    const distanceToTarget = Math.hypot(dx, dy);

    if (distanceToTarget <= PATH_REACHED_DISTANCE) {
      agent.position = { ...target };
      agent.pathIndex += 1;
      if (agent.pathIndex >= agent.currentPath.length) {
        agent.isMoving = false;
        agent.animationState = `idle-${agent.facing}`;
      }
      return;
    }

    const speedBoost = Math.min(3.5, Math.max(1, Math.sqrt(this.timeScale)));
    const step = Math.min(distanceToTarget, agent.speed * deltaSeconds * speedBoost);
    agent.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    agent.isMoving = true;
    agent.animationState = `walk-${agent.facing}`;
    agent.position.x += (dx / distanceToTarget) * step;
    agent.position.y += (dy / distanceToTarget) * step;
    if (agent.playerDirective?.kind === 'followPlayer') {
      agent.currentAction = `following ${this.player.profile.name}`;
      agent.lastAction = `Following ${this.player.profile.name} along an A* path.`;
    } else {
      agent.currentAction = `walking to ${LOCATION_BY_ID[agent.destination].name}`;
      agent.lastAction = `Moving to ${LOCATION_BY_ID[agent.destination].name} along an A* path.`;
    }
  }

  private act(agent: Agent, deltaVirtualMinutes: number): void {
    if (!this.isAtDestination(agent, agent.destination)) {
      return;
    }

    agent.currentAction = agent.plannedAction;
    const location = LOCATION_BY_ID[agent.destination];
    agent.lastAction = `${agent.plannedAction} at ${location.name}.`;

    const actionMemoryKey = `${location.id}:${agent.plannedAction}`;
    if (agent.lastActionMemoryKey !== actionMemoryKey) {
      agent.lastActionMemoryKey = actionMemoryKey;
      remember(
        agent,
        `I started ${agent.plannedAction} at ${location.name} at ${this.timeLabel}.`,
        this.timeMinutes,
        'observation',
        1,
        ['act', location.id],
      );
    }

    if (location.id === 'cafe' || location.id === 'restaurant') {
      agent.needs.hunger = clampNeed(agent.needs.hunger + 1.35 * deltaVirtualMinutes);
      agent.needs.social = clampNeed(agent.needs.social + 0.2 * deltaVirtualMinutes);
    }

    if (location.id === 'home') {
      agent.needs.energy = clampNeed(agent.needs.energy + 1.15 * deltaVirtualMinutes);
    }

    if (location.id === 'park') {
      agent.needs.energy = clampNeed(agent.needs.energy + 0.35 * deltaVirtualMinutes);
      agent.needs.social = clampNeed(agent.needs.social + 0.18 * deltaVirtualMinutes);
    }

    if (location.id === 'townSquare') {
      agent.needs.social = clampNeed(agent.needs.social + 0.95 * deltaVirtualMinutes);
    }

    if (location.id === 'library' || location.id === 'school') {
      agent.needs.energy = clampNeed(agent.needs.energy - 0.08 * deltaVirtualMinutes);
    }
  }

  private isAtDestination(agent: Agent, destination: LocationId): boolean {
    const target = agent.currentPath.length > 0 ? cellToWorld(agent.currentPath[agent.currentPath.length - 1]) : locationTargetWorld(destination);
    return Math.hypot(target.x - agent.position.x, target.y - agent.position.y) < 12;
  }

  private updateNeeds(agent: Agent, deltaVirtualMinutes: number): void {
    agent.needs.hunger = clampNeed(agent.needs.hunger - 0.28 * deltaVirtualMinutes);
    agent.needs.energy = clampNeed(agent.needs.energy - 0.14 * deltaVirtualMinutes);
    agent.needs.social = clampNeed(agent.needs.social - 0.18 * deltaVirtualMinutes);
  }

  private updateMood(agent: Agent): void {
    if (agent.needs.hunger < 25) {
      agent.mood = 'hungry';
      return;
    }

    if (agent.needs.energy < 22) {
      agent.mood = 'tired';
      return;
    }

    if (agent.needs.social < 22) {
      agent.mood = 'social';
    }
  }

  private updateNextPlan(agent: Agent): void {
    const seconds = Math.max(0, Math.ceil(agent.nextDecisionIn));
    agent.nextPlan = `Next planning check in ${seconds}s; current target is ${LOCATION_BY_ID[agent.destination].name}.`;
  }

  private tryConversations(): void {
    for (let i = 0; i < this.agents.length; i += 1) {
      for (let j = i + 1; j < this.agents.length; j += 1) {
        const first = this.agents[i];
        const second = this.agents[j];

        if (first.conversationCooldown > 0 || second.conversationCooldown > 0) {
          continue;
        }

        if (distance(first, second) > CONVERSATION_DISTANCE) {
          continue;
        }

        const firstLocation = this.agentLocation(first);
        const secondLocation = this.agentLocation(second);
        if (firstLocation.id !== secondLocation.id) {
          continue;
        }

        this.startConversation(first, second, firstLocation);
      }
    }
  }

  private startConversation(first: Agent, second: Agent, location: TownLocation): void {
    const result = this.dialogueProvider.generateDialogue({
      speaker: first,
      listener: second,
      location,
      timeLabel: this.timeLabel,
      recentEvents: this.events.slice(0, 2),
    });

    first.conversationCooldown = 18;
    second.conversationCooldown = 18;

    const firstLine = result.lines.find((line) => line.agentId === first.id)?.text ?? result.topic;
    const secondLine = result.lines.find((line) => line.agentId === second.id)?.text ?? 'I will remember that.';

    first.speechBubble = { text: firstLine, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
    second.speechBubble = { text: secondLine, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };

    first.needs.social = clampNeed(first.needs.social + 8);
    second.needs.social = clampNeed(second.needs.social + 8);
    remember(
      first,
      `Talked with ${second.name} at ${location.name}: ${result.topic}`,
      this.timeMinutes,
      'conversation',
      3,
      ['dialogue', location.id],
      [second.id],
    );
    remember(
      second,
      `Talked with ${first.name} at ${location.name}: ${result.topic}`,
      this.timeMinutes,
      'conversation',
      3,
      ['dialogue', location.id],
      [first.id],
    );
    this.socialGraph.recordConversation(first.id, second.id);
    this.syncRelationship(first, second);
    this.syncRelationship(second, first);
    this.tryPropagateEvent(first, second, location);
    this.tryPropagateEvent(second, first, location);
    this.addLog(`${first.name} and ${second.name} talked at ${location.name}: ${result.topic}`);
    this.replayRecorder.recordDialogue(
      [first.id, second.id],
      this.timeMinutes,
      `${first.name} and ${second.name} talked at ${location.name}: ${result.topic}`,
      [
        { speaker: first.name, text: firstLine, timeLabel: this.timeLabel },
        { speaker: second.name, text: secondLine, timeLabel: this.timeLabel },
      ],
    );
    this.requestLLMDialogue(first, second, location, result.topic);
  }

  private tryPropagateEvent(speaker: Agent, listener: Agent, location: TownLocation): void {
    const sharedMemory = speaker.memories.find((memory) => memory.type === 'event' && memory.tags.includes('player-event'));
    if (!sharedMemory) {
      return;
    }

    const eventTag = sharedMemory.tags.find((tag) => tag.startsWith('event-'));
    if (!eventTag || listener.memories.some((memory) => memory.tags.includes(eventTag))) {
      return;
    }

    const event = this.events.find((candidate) => candidate.id === eventTag);
    if (!event) {
      return;
    }

    remember(
      listener,
      `${speaker.name} told me about ${event.title} at ${LOCATION_BY_ID[event.locationId].name}.`,
      this.timeMinutes,
      'event',
      4,
      ['player-event', event.id, 'propagated'],
      [speaker.id],
    );
    this.addLog(`${speaker.name} told ${listener.name} about ${event.title}.`);

    if (isAgentInterestedInEvent(listener, event) && !event.interestedAgentIds.includes(listener.id)) {
      event.interestedAgentIds.push(listener.id);
      listener.interestedEventIds.push(event.id);
      this.applyPlan(listener, this.planningEngine.planFromEvent(listener, event), { source: 'rule' });
      this.addLog(`${listener.name} decided to attend ${event.title} after talking with ${speaker.name}.`);
    } else {
      listener.lastObservation = `${speaker.name} mentioned ${event.title} near ${location.name}, but I am only recording it.`;
    }
  }

  private syncRelationship(agent: Agent, other: Agent): void {
    const relationship = this.socialGraph.getRelationship(agent.id, other.id);
    agent.relationships[other.id] = {
      familiarity: relationship.familiarity,
      trust: relationship.trust,
      affinity: relationship.affinity,
    };
  }

  private beginLLMCall(type: 'plan' | 'dialogue' | 'reflection', lastCall: string): void {
    this.llmStatus = {
      ...this.llmStatus,
      lastCall,
      lastLatencyMs: 0,
      lastPromptType: type,
      callCounts: {
        ...this.llmStatus.callCounts,
        [type]: this.llmStatus.callCounts[type] + 1,
      },
    };
  }

  private markLLMSuccess(
    type: 'plan' | 'dialogue' | 'reflection',
    lastCall: string,
    latencyMs: number,
    lastResultSummary: string,
  ): void {
    this.llmStatus = {
      ...this.llmStatus,
      mode: 'Connected',
      lastCall,
      lastLatencyMs: latencyMs,
      lastPromptType: type,
      lastResultSummary,
      lastFailureReason: '',
      lastError: undefined,
    };
  }

  private requestLLMPlan(agent: Agent, observation: Observation, fallbackPlan: PlanResult): void {
    if (this.pendingLLMPlans.has(agent.id) || !this.shouldAttemptLLM('plan', agent.id)) {
      return;
    }

    this.pendingLLMPlans.add(agent.id);
    this.beginLLMCall('plan', `Planning for ${agent.name}`);

    this.llmClient
      .plan({
        validDestinations: Object.keys(LOCATION_BY_ID),
        agent,
        observation,
        retrievedMemories: agent.retrievedMemories,
        events: observation.activeEvents.slice(0, 3),
      })
      .then(({ data, latencyMs }) => {
        const validation = this.planningEngine.validateLLMPlan(data);
        if (!validation.valid || !validation.plan) {
          agent.lastLLMDecision = `Rejected invalid LLM plan: ${validation.errors.join('; ')}`;
          this.markLLMFailure('plan', `Invalid plan for ${agent.name}`, new Error(validation.errors.join('; ')), true);
          return;
        }

        agent.lastLLMDecision = this.describeLLMPlan(data);
        this.markLLMSuccess('plan', `Accepted plan for ${agent.name}`, latencyMs, agent.lastLLMDecision);
        if (data.speak) {
          agent.speechBubble = { text: data.speak, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
        }
        this.applyPlan(agent, validation.plan, { source: 'llm' });
        this.addLog(`LLM plan accepted for ${agent.name}: ${validation.plan.reason}`);
      })
      .catch((error) => {
        agent.lastLLMDecision = `Fallback rule plan: ${fallbackPlan.reason}`;
        this.markLLMFailure('plan', `Fallback plan for ${agent.name}`, error, false);
      })
      .finally(() => {
        this.pendingLLMPlans.delete(agent.id);
      });
  }

  private requestLLMDialogue(first: Agent, second: Agent, location: TownLocation, topicHint: string): void {
    const key = `${first.id}:${second.id}`;
    if (this.pendingLLMDialogues.has(key) || !this.shouldAttemptLLM('dialogue', key)) {
      return;
    }

    this.pendingLLMDialogues.add(key);
    this.beginLLMCall('dialogue', `Dialogue for ${first.name} and ${second.name}`);

    this.llmClient
      .dialogue({
        speaker: first,
        listener: second,
        locationName: location.name,
        timeLabel: this.timeLabel,
        topicHint,
        speakerMemories: first.retrievedMemories.length ? first.retrievedMemories : first.memories.slice(0, 3),
        listenerMemories: second.retrievedMemories.length ? second.retrievedMemories : second.memories.slice(0, 3),
        recentEvents: this.events.slice(0, 2),
      })
      .then(({ data, latencyMs }) => {
        const safeDialogue = this.normalizeLLMDialogue(data, first, second);
        this.markLLMSuccess(
          'dialogue',
          `Dialogue generated for ${first.name}/${second.name}`,
          latencyMs,
          `${safeDialogue.topic}: ${safeDialogue.speakerLine} / ${safeDialogue.listenerLine}`,
        );
        first.speechBubble = { text: safeDialogue.speakerLine, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
        second.speechBubble = { text: safeDialogue.listenerLine, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
        this.addLog(`LLM dialogue: ${first.name} and ${second.name} discussed ${safeDialogue.topic}.`);
        this.replayRecorder.recordDialogue(
          [first.id, second.id],
          this.timeMinutes,
          `LLM dialogue: ${first.name}/${second.name} - ${safeDialogue.topic}`,
          [
            { speaker: first.name, text: safeDialogue.speakerLine, timeLabel: this.timeLabel },
            { speaker: second.name, text: safeDialogue.listenerLine, timeLabel: this.timeLabel },
          ],
        );
      })
      .catch((error) => {
        this.markLLMFailure('dialogue', `Template dialogue for ${first.name}/${second.name}`, error, false);
      })
      .finally(() => {
        this.pendingLLMDialogues.delete(key);
      });
  }

  private requestLLMReflection(agent: Agent, memories: Agent['memories']): void {
    if (this.pendingLLMReflections.has(agent.id) || !this.shouldAttemptLLM('reflection', agent.id)) {
      return;
    }

    this.pendingLLMReflections.add(agent.id);
    this.beginLLMCall('reflection', `Reflection for ${agent.name}`);

    this.llmClient
      .reflection({
        agent,
        memories,
        timeLabel: this.timeLabel,
      })
      .then(({ data, latencyMs }) => {
        if (!data.reflection || data.reflection.trim().length < 8) {
          this.markLLMFailure('reflection', `Invalid reflection for ${agent.name}`, new Error('Reflection text too short.'), true);
          return;
        }

        agent.reflection = data.reflection.trim();
        memoryStore.write(agent, {
          summary: `LLM reflection: ${agent.reflection}`,
          timeMinutes: this.timeMinutes,
          type: 'reflection',
          importance: 4,
          tags: ['reflection', 'llm'],
          evidenceMemoryIds: memories.map((memory) => memory.id),
          embeddingText: agent.reflection,
        });
        this.replayRecorder.recordReflection(agent, this.timeMinutes, agent.reflection, memories);
        this.markLLMSuccess('reflection', `Reflection generated for ${agent.name}`, latencyMs, agent.reflection);
        this.addLog(`LLM reflection for ${agent.name}: ${agent.reflection}`);
      })
      .catch((error) => {
        this.markLLMFailure('reflection', `Template reflection for ${agent.name}`, error, false);
      })
      .finally(() => {
        this.pendingLLMReflections.delete(agent.id);
      });
  }

  private normalizeLLMDialogue(data: LLMDialogueResult, first: Agent, second: Agent): LLMDialogueResult {
    return {
      topic: data.topic?.trim() || 'recent town events',
      speakerLine: data.speakerLine?.trim() || `${first.name} is thinking about recent town events.`,
      listenerLine: data.listenerLine?.trim() || `${second.name} will remember that.`,
    };
  }

  private describeLLMPlan(data: LLMPlanResult): string {
    return `LLM chose ${data.destination}: ${data.reason}${data.speak ? ` Speak: "${data.speak}"` : ''}`;
  }

  private shouldAttemptLLM(type: 'plan' | 'dialogue' | 'reflection', id: string): boolean {
    if (this.llmUnavailable) {
      return false;
    }

    const key = `${type}:${id}`;
    const lastAttempt = this.lastLLMAttemptMs.get(key);
    if (lastAttempt !== undefined && this.elapsedMs - lastAttempt < LLM_ATTEMPT_COOLDOWN_MS) {
      return false;
    }

    this.lastLLMAttemptMs.set(key, this.elapsedMs);
    return true;
  }

  private markLLMFailure(
    type: 'plan' | 'dialogue' | 'reflection',
    lastCall: string,
    error: unknown,
    invalidResponse: boolean,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    const missingEnv = message.includes('llm_not_configured') || message.includes('OPENAI_API_KEY');
    const proxyOffline = message.includes('LLM proxy offline') || message.includes('Failed to fetch') || message.includes('timed out');
    const upstreamConfigError = /401|403|404|model|API key|Unauthorized/i.test(message);
    const displayReason = missingEnv ? 'Fallback: missing .env' : message;
    if (missingEnv || proxyOffline || upstreamConfigError) {
      this.llmUnavailable = true;
    }

    this.llmStatus = {
      ...this.llmStatus,
      mode: invalidResponse ? 'Error' : 'Fallback',
      lastCall: missingEnv ? 'Fallback: missing .env' : lastCall,
      lastLatencyMs: 0,
      lastPromptType: type,
      lastFailureReason: displayReason,
      fallbackCount: this.llmStatus.fallbackCount + 1,
      lastError: displayReason,
    };

    const logKey = `${type}:${lastCall}:${displayReason.slice(0, 40)}`;
    if (!this.loggedLLMFailures.has(logKey)) {
      this.loggedLLMFailures.add(logKey);
      this.addLog(`LLM ${type} fallback: ${missingEnv ? 'missing .env' : lastCall}.`);
    }
  }

  private tryGroupEvents(): void {
    for (const event of this.events) {
      if (event.groupInteractionDone || event.source !== 'system' || event.locationId !== 'townSquare') {
        continue;
      }

      const sinceEventStarted = minutesUntil(event.timeMinutes, Math.floor(this.timeMinutes));
      if (sinceEventStarted > EVENT_RESPONSE_DISTANCE_MINUTES) {
        continue;
      }

      const participants = event.interestedAgentIds
        .map((agentId) => this.agents.find((agent) => agent.id === agentId))
        .filter((agent): agent is Agent => Boolean(agent))
        .filter((agent) => this.agentLocation(agent).id === event.locationId || agent.destination === event.locationId);

      if (participants.length >= 3) {
        this.startGroupInteraction(event, participants);
      }
    }
  }

  private startGroupInteraction(event: WorldEvent, participants: Agent[]): void {
    event.groupInteractionDone = true;
    const placeName = LOCATION_BY_ID[event.locationId].name;
    const nora = participants.find((agent) => agent.id === 'nora');
    const sami = participants.find((agent) => agent.id === 'sami');
    const otto = participants.find((agent) => agent.id === 'otto');
    const participantNames = participants.map((agent) => agent.name).join(', ');

    this.addLog(`Group event started: ${event.description}.`);

    if (nora && sami) {
      this.addLog('Nora interviews Sami about the gathering.');
    }

    if (otto) {
      this.addLog(`Otto notices more visitors near ${placeName}.`);
    }

    if (sami && nora && otto) {
      this.addLog('Sami remembers meeting Nora and Otto at the gathering.');
    }

    for (const agent of participants) {
      const specificMemory =
        agent.id === 'nora' && sami
          ? `Interviewed Sami about ${event.title} at ${placeName}.`
          : agent.id === 'otto'
            ? `Noticed more visitors near ${placeName} during ${event.title}.`
            : agent.id === 'sami' && nora && otto
              ? `Met Nora and Otto at ${event.title}.`
              : `Joined ${event.title} with ${participantNames} at ${placeName}.`;

      agent.currentAction = `joining ${event.title}`;
      agent.lastAction = `Joining group interaction at ${placeName}.`;
      agent.speechBubble = {
        text: specificMemory,
        expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS,
      };
      remember(
        agent,
        specificMemory,
        this.timeMinutes,
        'event',
        5,
        ['group-event', event.id],
        participants.filter((other) => other.id !== agent.id).map((other) => other.id),
      );
    }
  }

  private agentLocation(agent: Agent): TownLocation {
    return findLocationAt(agent.position) ?? LOCATION_BY_ID[agent.destination];
  }

  private addLog(message: string): void {
    this.logs.unshift({
      id: logId(),
      time: this.timeLabel,
      message,
    });
  }

  private addLogsInDisplayOrder(messages: string[]): void {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      this.addLog(messages[index]);
    }
  }
}
