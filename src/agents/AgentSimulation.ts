import {
  LLMClient,
  type LLMDialogueResult,
  type LLMPlanResult,
  type LLMPlayerDialogueResult,
  type LLMPlayerDialogueRequest,
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
  HARVESTABLE_PLANTS,
  isWalkableCell,
  LOCATION_TARGETS,
  locationEntranceWorld,
  locationTargetWorld,
  nearestWalkableCell,
  worldToCell,
} from '../data/townGrid';
import {
  PLAYER_DIALOGUE_OPTIONS,
  type DeductionConfigInput,
  type GameMode,
  type PlayerDialogueOptionId,
  type PlayerMovementInput,
  type PlayerProfile,
  type PlayerProfileInput,
  type PlayerRequestState,
  type PlayerState,
  type PlayerStats,
} from '../player/types';
import { interpretPlayerDialogueAction, type InterpretedAction } from './ActionInterpreter';
import { isAgentInterestedInEvent } from './DecisionEngine';
import { findPath, type GridPoint, type PathfindingGrid } from './Pathfinding';
import { memoryStore } from './MemoryStore';
import { PlanningEngine } from './PlanningEngine';
import { ReflectionEngine } from './ReflectionEngine';
import { ReplayRecorder } from './ReplayRecorder';
import { SocialGraph } from './SocialGraph';
import { remember } from './memory';
import { DAY_MINUTES, formatTime, minutesUntil, parseTimeToMinutes } from './time';
import type { Agent, AgentEmoteKind, LLMRuntimeStatus, LogEntry, Observation, PlanResult, WorldEvent } from './types';
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
const PLAYER_HARVEST_DISTANCE = 42;
const PLAYER_GATHERING_TEXT = '18:00 Town Square has a music party';
const FOLLOW_PLAYER_DISTANCE = 44;
const FOLLOW_PLAYER_REPATH_DISTANCE = 28;
const FOLLOW_PLAYER_DURATION_MINUTES = 140;
const INSPECT_DIRECTIVE_DURATION_MINUTES = 90;
const EMOTE_DURATION_MS = 5200;
const DEDUCTION_DAY_START_MINUTES = 8 * 60;
const DEDUCTION_NIGHT_START_MINUTES = 20 * 60;
const DEDUCTION_MAX_NPCS = 10;
const DEDUCTION_MIN_NPCS = 5;
const DEDUCTION_NPC_CONVERSATIONS_PER_DAY = 3;
const DEDUCTION_PAIRING_INTERVAL_MINUTES = 65;
const DEDUCTION_PLAYER_BASE_QUESTIONS = 8;
const DEDUCTION_PLAYER_SUSPICION_LIMIT = 100;
const PLAYER_SUSPICION_TARGET_ID = '__player__';
const SHAPESHIFTER_SKILL_DAILY_CHARGES: Record<ShapeshifterSkillId, number> = {
  listen: 2,
  forge: 1,
  lure: 1,
};
const SHAPESHIFTER_LURE_LOCATIONS: LocationId[] = ['townSquare', 'park', 'cafe', 'library', 'dock', 'postOffice'];

type DeductionPhase = 'day' | 'nightAccuse' | 'nightResult' | 'ended';
type DeductionWinner = 'player' | 'shapeshifters' | 'townsfolk';
type DeductionPlayerSide = 'protector' | 'shapeshifter';
type EvidenceClueType =
  | 'mayorQuestion'
  | 'privateRouteProbe'
  | 'roleGroundedReason'
  | 'mayorMisdirection'
  | 'contradiction'
  | 'playerProbe'
  | 'nightKill'
  | 'trustShift';
export type ShapeshifterSkillId = 'listen' | 'forge' | 'lure';

interface EvidenceClue {
  id: string;
  day: number;
  timeLabel: string;
  type: EvidenceClueType;
  summary: string;
  relatedAgentIds: string[];
  sourceDialogueId?: string;
  weight: number;
  tags: string[];
  forged?: boolean;
  privateToPlayer?: boolean;
}

interface DeductionVoteHint {
  id: string;
  day: number;
  observerId: string;
  targetId: string;
  observerName: string;
  targetName: string;
  reason: string;
  score: number;
  tags: string[];
}

interface ShapeshifterSkillState {
  charges: Record<ShapeshifterSkillId, number>;
  usedToday: Record<ShapeshifterSkillId, number>;
  lastSkillMessage: string;
  privateClueIds: string[];
}

interface DeductionDayRecap {
  id: string;
  day: number;
  title: string;
  summary: string;
  evidenceCount: number;
  dialogueCount: number;
  topSuspicion?: string;
  nightOutcome?: string;
  requestSummary?: string;
}

interface DeductionDialogueRecord {
  id: string;
  day: number;
  timeLabel: string;
  locationName: string;
  speakerId: string;
  listenerId: string;
  speakerName: string;
  listenerName: string;
  lines: string[];
  topic: string;
  tags: string[];
}

interface MayorMisdirectionClaim {
  claimantId: string;
  claimedMayorId: string;
  listenerId: string;
  count: number;
  day: number;
  timeLabel: string;
}

interface DeductionPairing {
  partnerId: string;
  locationId: LocationId;
  untilMinutes: number;
}

interface DeductionState {
  enabled: true;
  phase: DeductionPhase;
  playerSide: DeductionPlayerSide;
  day: number;
  npcCount: number;
  shapeshifterCount: number;
  participantIds: string[];
  aliveAgentIds: string[];
  mayorAgentId: string;
  shapeshifterIds: string[];
  eliminatedShapeshifterIds: string[];
  deadAgentIds: string[];
  playerDialogueLimit: number;
  playerDialoguesUsed: number;
  npcConversationLimitPerAgent: number;
  npcConversationCounts: Record<string, number>;
  dialogueHistory: DeductionDialogueRecord[];
  evidenceBoard: EvidenceClue[];
  npcSuspicion: Record<string, Record<string, number>>;
  npcVoteHints: DeductionVoteHint[];
  dayRecaps: DeductionDayRecap[];
  mayorMisdirectionClaims: MayorMisdirectionClaim[];
  shapeshifterMayorSuspicion: Record<string, Record<string, number>>;
  shapeshifterSkills?: ShapeshifterSkillState;
  activePairings: Record<string, DeductionPairing>;
  nextPairingMinutes: number;
  playerSuspicion: number;
  playerWrongKills: number;
  accusedAgentId?: string;
  lastKilledAgentId?: string;
  nightMessage: string;
  winner?: DeductionWinner;
  resultOverlay?: 'win' | 'lose';
}

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
    playerDirective: undefined,
    emoteState: undefined,
    pendingMessage: undefined,
    relationshipDeltaReason: undefined,
    deductionRole: undefined,
    isAlive: true,
  }));
}

function createShapeshifterSkillState(previous?: ShapeshifterSkillState): ShapeshifterSkillState {
  return {
    charges: { ...SHAPESHIFTER_SKILL_DAILY_CHARGES },
    usedToday: { listen: 0, forge: 0, lure: 0 },
    lastSkillMessage: previous?.lastSkillMessage ?? 'Skills ready.',
    privateClueIds: [...(previous?.privateClueIds ?? [])],
  };
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

function shuffled<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
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
    gold: 20,
    inventory: [],
    quest: {
      id: 'organize-evening-gathering',
      title: 'Organize Evening Gathering',
      talkedNpcIds: [],
      invitedNpcIds: [],
      completed: false,
    },
    requests: [],
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
  inventoryOpen = false;
  gameMode: GameMode = 'life';
  deduction?: DeductionState;
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
  private readonly harvestedPlantIds = new Set<string>();
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

  get deductionMayorName(): string {
    if (!this.deduction) {
      return 'None';
    }

    return this.agents.find((agent) => agent.id === this.deduction?.mayorAgentId)?.name ?? 'Unknown';
  }

  get deductionAliveAgents(): Agent[] {
    if (!this.deduction) {
      return [];
    }

    return this.deduction.aliveAgentIds
      .map((agentId) => this.agents.find((agent) => agent.id === agentId))
      .filter((agent): agent is Agent => Boolean(agent));
  }

  getDeductionEvidence(): EvidenceClue[] {
    return this.deduction?.evidenceBoard ?? [];
  }

  useShapeshifterSkill(
    skillId: ShapeshifterSkillId,
    payload: { targetAgentId?: string; locationId?: LocationId } = {},
  ): void {
    const state = this.deduction;
    if (!state || state.playerSide !== 'shapeshifter' || state.phase !== 'day' || !state.shapeshifterSkills) {
      return;
    }

    const skills = state.shapeshifterSkills;
    if ((skills.charges[skillId] ?? 0) <= 0) {
      skills.lastSkillMessage = `${this.skillLabel(skillId)} has no uses left today.`;
      this.addLog(skills.lastSkillMessage);
      return;
    }

    const targetAgent = payload.targetAgentId
      ? this.agents.find((agent) => agent.id === payload.targetAgentId && state.aliveAgentIds.includes(agent.id))
      : this.deductionAliveAgents[0];
    const locationId = payload.locationId && SHAPESHIFTER_LURE_LOCATIONS.includes(payload.locationId)
      ? payload.locationId
      : 'townSquare';

    if (!targetAgent) {
      skills.lastSkillMessage = 'No valid target for that skill.';
      return;
    }

    skills.charges[skillId] = Math.max(0, skills.charges[skillId] - 1);
    skills.usedToday[skillId] = (skills.usedToday[skillId] ?? 0) + 1;

    if (skillId === 'listen') {
      this.useListenSkill(targetAgent);
      return;
    }

    if (skillId === 'forge') {
      this.useForgeSkill(targetAgent);
      return;
    }

    this.useLureSkill(targetAgent, locationId);
  }

  get harvestedPlantSignature(): string {
    return [...this.harvestedPlantIds].sort().join('|');
  }

  isPlantHarvested(plantId: string): boolean {
    return this.harvestedPlantIds.has(plantId);
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

  toggleInventory(): void {
    if (!this.started) {
      return;
    }

    this.inventoryOpen = !this.inventoryOpen;
  }

  closeInventory(): void {
    this.inventoryOpen = false;
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
    const currentMode = this.gameMode;
    const currentDeductionConfig = this.deduction
      ? {
          npcCount: this.deduction.npcCount,
          shapeshifterCount: this.deduction.shapeshifterCount,
        }
      : undefined;
    this.deduction = undefined;
    this.agents = currentMode === 'deduction' || currentMode === 'shapeshifter' ? this.createDeductionAgents(currentDeductionConfig) : cloneAgents();
    this.events = [];
    this.logs = [];
    this.selectedAgentId = undefined;
    this.player = createPlayerState(playerProfile);
    this.started = wasStarted;
    this.timeMinutes = 8 * 60;
    this.paused = false;
    this.timeScale = 1;
    this.inventoryOpen = false;
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
    this.harvestedPlantIds.clear();
    this.replayRecorder.clear();
    this.llmUnavailable = false;
    this.lastInteractionHintMs = -Infinity;
    this.lastQuestCheckMs = -Infinity;
    if (this.started) {
      if (currentMode === 'deduction' || currentMode === 'shapeshifter') {
        this.initializeDeductionState(currentDeductionConfig, currentMode === 'shapeshifter' ? 'shapeshifter' : 'protector');
        this.addLog('Deduction run reset to Day 1 at 08:00.');
      } else {
        this.seedBuiltInEvents();
        this.addLog('Simulation reset to 08:00.');
      }
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
    const requestedMode = input.gameMode ?? 'life';
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
    this.gameMode = requestedMode;
    this.deduction = undefined;
    this.agents = requestedMode === 'deduction' || requestedMode === 'shapeshifter' ? this.createDeductionAgents(input.deductionConfig) : cloneAgents();
    this.events = [];
    this.logs = [];
    this.selectedAgentId = undefined;
    this.timeMinutes = 8 * 60;
    this.elapsedMs = 0;
    this.inventoryOpen = false;
    this.pathFailureKeys.clear();
    this.pathCache.clear();
    this.harvestedPlantIds.clear();
    this.reflectionSourceKeys.clear();

    if (requestedMode === 'deduction' || requestedMode === 'shapeshifter') {
      this.initializeDeductionState(input.deductionConfig, requestedMode === 'shapeshifter' ? 'shapeshifter' : 'protector');
    } else {
      this.seedBuiltInEvents();
      this.addLog(`${this.player.profile.name} entered town at ${LOCATION_BY_ID[profile.spawnLocation].name}.`);
      this.addLog(`Town simulation started with ${this.agents.length} NPCs.`);
    }

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

  private normalizeDeductionConfig(config?: DeductionConfigInput): Required<DeductionConfigInput> {
    const npcCount = Math.max(DEDUCTION_MIN_NPCS, Math.min(DEDUCTION_MAX_NPCS, Math.round(config?.npcCount ?? 6)));
    const shapeshifterCount = Math.max(1, Math.min(Math.max(1, npcCount - 1), Math.round(config?.shapeshifterCount ?? 1)));
    return { npcCount, shapeshifterCount };
  }

  private createDeductionAgents(config?: DeductionConfigInput): Agent[] {
    const { npcCount } = this.normalizeDeductionConfig(config);
    const startLocations: LocationId[] = ['townSquare', 'park', 'library', 'cafe', 'inn', 'school', 'dock', 'postOffice', 'farm', 'clinic'];
    return cloneAgents()
      .filter((agent) => agent.mobility !== 'counterBound')
      .slice(0, npcCount)
      .map((agent, index) => {
        const locationId = startLocations[index % startLocations.length];
        const position = cellToWorld(nearestWalkableCell(LOCATION_TARGETS[locationId]));
        return {
          ...agent,
          mobility: 'roaming',
          homeLocationId: undefined,
          counterAnchor: undefined,
          tradeProfile: undefined,
          position,
          destination: locationId,
          currentGoal: 'Survive the day and observe suspicious behavior',
          currentAction: 'watching the town',
          plannedAction: 'watching the town',
          reason: 'Deduction mode is active, so I am moving freely and watching other townspeople.',
          lastObservation: `It is 08:00 and I am starting the deduction day near ${LOCATION_BY_ID[locationId].name}.`,
          lastPlan: 'Move through town, talk with one other NPC, and react naturally.',
          nextPlan: 'Continue the deduction day until nightfall.',
          currentPath: [],
          pathIndex: 0,
          conversationCooldown: 2 + Math.random() * 3,
          nextDecisionIn: 0.4 + Math.random(),
          deductionRole: 'townsfolk',
          isAlive: true,
        };
      });
  }

  private initializeDeductionState(config?: DeductionConfigInput, playerSide: DeductionPlayerSide = 'protector'): void {
    const { npcCount, shapeshifterCount } = this.normalizeDeductionConfig(config);
    const participantIds = this.agents.map((agent) => agent.id);
    const mayorAgentId = shuffled(participantIds)[0];
    const npcShapeshifterCount = playerSide === 'shapeshifter' ? 0 : shapeshifterCount;
    const shapeshifterIds = shuffled(participantIds.filter((agentId) => agentId !== mayorAgentId)).slice(0, npcShapeshifterCount);
    const playerDialogueLimit = Math.max(3, DEDUCTION_PLAYER_BASE_QUESTIONS - Math.max(0, shapeshifterCount - 1) * 2);
    const mayorName = this.agents.find((agent) => agent.id === mayorAgentId)?.name ?? 'Unknown';

    for (const agent of this.agents) {
      agent.deductionRole = shapeshifterIds.includes(agent.id) ? 'shapeshifter' : agent.id === mayorAgentId ? 'mayor' : 'townsfolk';
      agent.isAlive = true;
      agent.mood = agent.deductionRole === 'shapeshifter' ? 'curious' : 'focused';
    }

    this.timeMinutes = DEDUCTION_DAY_START_MINUTES;
    this.deduction = {
      enabled: true,
      phase: 'day',
      playerSide,
      day: 1,
      npcCount,
      shapeshifterCount: playerSide === 'shapeshifter' ? 1 : shapeshifterCount,
      participantIds,
      aliveAgentIds: [...participantIds],
      mayorAgentId,
      shapeshifterIds,
      eliminatedShapeshifterIds: [],
      deadAgentIds: [],
      playerDialogueLimit,
      playerDialoguesUsed: 0,
      npcConversationLimitPerAgent: DEDUCTION_NPC_CONVERSATIONS_PER_DAY,
      npcConversationCounts: Object.fromEntries(participantIds.map((agentId) => [agentId, 0])),
      dialogueHistory: [],
      evidenceBoard: [],
      npcSuspicion: Object.fromEntries(participantIds.map((agentId) => [agentId, {}])),
      npcVoteHints: [],
      dayRecaps: [],
      mayorMisdirectionClaims: [],
      shapeshifterMayorSuspicion: Object.fromEntries(shapeshifterIds.map((agentId) => [agentId, {}])),
      shapeshifterSkills: playerSide === 'shapeshifter' ? createShapeshifterSkillState() : undefined,
      activePairings: {},
      nextPairingMinutes: DEDUCTION_DAY_START_MINUTES + 18,
      playerSuspicion: 0,
      playerWrongKills: 0,
      nightMessage:
        playerSide === 'shapeshifter'
          ? 'Find the mayor before night. Ask carefully; the town will grow suspicious if you kill the wrong person.'
          : `Find the shapeshifter before night. You know the mayor is ${mayorName}.`,
    };

    if (playerSide === 'shapeshifter') {
      this.addLog(`Shapeshifter Mode started with ${npcCount} roaming NPCs. Find the hidden mayor before the town exposes you.`);
    } else {
      this.addLog(`Deduction Mode started with ${npcCount} roaming NPCs and ${shapeshifterCount} shapeshifter(s).`);
      this.addLog(`Only the player knows the mayor: ${mayorName}. Protect them until the shapeshifters are gone.`);
    }
  }

  updatePlayerMovement(input: PlayerMovementInput, deltaSeconds: number): void {
    if (!this.started) {
      this.player.isMoving = false;
      this.player.animationState = `idle-${this.player.facing}`;
      return;
    }

    if (this.deduction && this.deduction.phase !== 'day') {
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
    if (this.deduction && this.deduction.phase !== 'day') {
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

    if (hint.kind === 'object' && hint.targetId) {
      this.tryHarvestPlant(hint.targetId);
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
    agent.pendingMessage = undefined;
    if (agent.emoteState?.kind === 'message') {
      agent.emoteState = undefined;
    }
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

    if (optionId === 'ask-request') {
      this.handlePlayerRequestDialogue(agent, playerMessage);
      return;
    }

    if (this.deduction) {
      if (this.deduction.phase !== 'day') {
        this.closePlayerDialogue();
        return;
      }
      if (this.deduction.playerDialoguesUsed >= this.deduction.playerDialogueLimit) {
        this.player.dialogue = {
          ...dialogue,
          npcLine: 'You have no questions left today. Wait until nightfall.',
          awaitingLLM: false,
        };
        this.addLog('No deduction questions remain today.');
        return;
      }
      this.deduction.playerDialoguesUsed += 1;
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
    this.maybeEnterDeductionNight();
    if (this.deduction && this.deduction.phase !== 'day') {
      this.logs = this.logs.slice(0, 30);
      return;
    }

    for (const agent of this.agents) {
      if (agent.isAlive === false) {
        continue;
      }
      agent.conversationCooldown = Math.max(0, agent.conversationCooldown - deltaSeconds);
      if (agent.emoteState?.expiresAtMs !== undefined && agent.emoteState.expiresAtMs <= this.elapsedMs) {
        agent.emoteState = undefined;
      }
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

    this.tryScheduleDeductionPairing();
    this.tryConversations();
    this.tryGroupEvents();
    this.tryCompletePlayerQuest(false);
    this.logs = this.logs.slice(0, 30);
  }

  private isAgentInPlayerDialogue(agentId: string): boolean {
    return this.player.dialogue?.npcId === agentId;
  }

  private maybeEnterDeductionNight(): void {
    if (!this.deduction || this.deduction.phase !== 'day' || this.timeMinutes < DEDUCTION_NIGHT_START_MINUTES) {
      return;
    }

    this.computeNightVoteHints();
    this.upsertDeductionDayRecap();
    this.deduction.phase = 'nightAccuse';
    this.deduction.nightMessage =
      this.deduction.playerSide === 'shapeshifter'
        ? `Night ${this.deduction.day}: choose a victim. If you kill the mayor, you win.`
        : `Night ${this.deduction.day}: choose one suspicious NPC. Mayor to protect: ${this.deductionMayorName}.`;
    this.paused = true;
    this.closePlayerDialogue();
    for (const agent of this.agents) {
      agent.isMoving = false;
      agent.animationState = `idle-${agent.facing}`;
    }
    this.addLog(
      this.deduction.playerSide === 'shapeshifter'
        ? `Night fell on Day ${this.deduction.day}. Choose a victim.`
        : `Night fell on Day ${this.deduction.day}. Choose a suspect.`,
    );
  }

  accuseDeductionSuspect(agentId: string): void {
    this.chooseDeductionNightTarget(agentId);
  }

  chooseDeductionNightTarget(agentId: string): void {
    const state = this.deduction;
    if (!state || state.phase !== 'nightAccuse' || !state.aliveAgentIds.includes(agentId)) {
      return;
    }

    if (state.playerSide === 'shapeshifter') {
      this.resolvePlayerShapeshifterKill(agentId);
      return;
    }

    state.accusedAgentId = agentId;
    const accused = this.agents.find((agent) => agent.id === agentId);
    const accusedName = accused?.name ?? 'Unknown';
    const correct = state.shapeshifterIds.includes(agentId);
    const resultLines: string[] = [];

    if (correct) {
      state.eliminatedShapeshifterIds.push(agentId);
      state.shapeshifterIds = state.shapeshifterIds.filter((candidate) => candidate !== agentId);
      state.aliveAgentIds = state.aliveAgentIds.filter((candidate) => candidate !== agentId);
      this.removeAgentFromWorld(agentId, `${accusedName} was exposed as a shapeshifter.`);
      resultLines.push(`${accusedName} was a shapeshifter and was banished.`);
      this.addLog(`${this.player.profile.name} correctly accused ${accusedName}.`);
    } else {
      resultLines.push(`${accusedName} was not a shapeshifter.`);
      this.addLog(`${this.player.profile.name} accused ${accusedName}, but they were innocent.`);
      this.addEvidenceClue({
        type: 'trustShift',
        summary: `${this.player.profile.name} accused ${accusedName}, but the accusation was wrong.`,
        relatedAgentIds: [agentId],
        weight: 2,
        tags: ['night', 'wrong-accusation'],
      });
    }

    if (state.shapeshifterIds.length === 0) {
      state.phase = 'ended';
      state.winner = 'player';
      state.resultOverlay = 'win';
      state.nightMessage = `${resultLines.join(' ')} All shapeshifters are gone. You win.`;
      this.upsertDeductionDayRecap(state.nightMessage);
      this.addLog('Deduction victory: all shapeshifters were removed.');
      return;
    }

    const killedAgentId = this.pickShapeshifterKillTarget();
    if (killedAgentId) {
      state.lastKilledAgentId = killedAgentId;
      state.deadAgentIds.push(killedAgentId);
      state.aliveAgentIds = state.aliveAgentIds.filter((candidate) => candidate !== killedAgentId);
      const killed = this.agents.find((agent) => agent.id === killedAgentId);
      const killedName = killed?.name ?? 'Unknown';
      this.removeAgentFromWorld(killedAgentId, `${killedName} disappeared during the night.`);
      resultLines.push(`During the night, ${killedName} was killed.`);
      this.addLog(`A shapeshifter killed ${killedName} during the night.`);
      this.addEvidenceClue({
        type: 'nightKill',
        summary: `${killedName} was killed during the night.`,
        relatedAgentIds: [killedAgentId],
        weight: 5,
        tags: ['night', 'kill'],
      });
      if (killedAgentId === state.mayorAgentId) {
        state.phase = 'ended';
        state.winner = 'shapeshifters';
        state.resultOverlay = 'lose';
        state.nightMessage = `${resultLines.join(' ')} The mayor died. You lose.`;
        this.upsertDeductionDayRecap(state.nightMessage);
        this.addLog('Deduction defeat: the mayor was killed.');
        return;
      }
    }

    state.phase = 'nightResult';
    state.nightMessage = `${resultLines.join(' ')} The mayor is still alive. Continue to Day ${state.day + 1}.`;
    this.upsertDeductionDayRecap(state.nightMessage);
  }

  private resolvePlayerShapeshifterKill(agentId: string): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    state.accusedAgentId = agentId;
    const target = this.agents.find((agent) => agent.id === agentId);
    const targetName = target?.name ?? 'Unknown';

    state.lastKilledAgentId = agentId;
    state.deadAgentIds.push(agentId);
    state.aliveAgentIds = state.aliveAgentIds.filter((candidate) => candidate !== agentId);
    this.removeAgentFromWorld(agentId, `${targetName} was killed during the night.`);
    this.addEvidenceClue({
      type: 'nightKill',
      summary: `${targetName} was killed by the player shapeshifter.`,
      relatedAgentIds: [agentId],
      weight: 5,
      tags: ['night', 'player-kill'],
      privateToPlayer: false,
    });

    if (agentId === state.mayorAgentId) {
      state.phase = 'ended';
      state.winner = 'player';
      state.resultOverlay = 'win';
      state.nightMessage = `${targetName} was the mayor. You win.`;
      this.upsertDeductionDayRecap(state.nightMessage);
      this.addLog(`Shapeshifter victory: ${this.player.profile.name} killed the mayor, ${targetName}.`);
      return;
    }

    state.playerWrongKills += 1;
    const suspicionGain = Math.round((38 + state.day * 6) * this.playerSuspicionModifier());
    state.playerSuspicion = Math.min(DEDUCTION_PLAYER_SUSPICION_LIMIT, state.playerSuspicion + suspicionGain);
    this.addLog(`${this.player.profile.name} killed ${targetName}, but they were not the mayor. Town suspicion rose by ${suspicionGain}.`);

    if (state.playerSuspicion >= DEDUCTION_PLAYER_SUSPICION_LIMIT || state.playerWrongKills >= 3) {
      state.phase = 'ended';
      state.winner = 'townsfolk';
      state.resultOverlay = 'lose';
      state.nightMessage = `${targetName} was not the mayor. The town exposed you as the shapeshifter. You lose.`;
      this.upsertDeductionDayRecap(state.nightMessage);
      this.addLog('Shapeshifter defeat: the town exposed the player.');
      return;
    }

    state.phase = 'nightResult';
    state.nightMessage = `${targetName} was not the mayor. Suspicion is ${state.playerSuspicion}/100. Continue to Day ${state.day + 1}.`;
    this.upsertDeductionDayRecap(state.nightMessage);
  }

  continueDeductionRound(): void {
    const state = this.deduction;
    if (!state || state.phase !== 'nightResult') {
      return;
    }

    state.day += 1;
    state.phase = 'day';
    state.playerDialoguesUsed = 0;
    state.accusedAgentId = undefined;
    state.lastKilledAgentId = undefined;
    state.npcConversationCounts = Object.fromEntries(state.aliveAgentIds.map((agentId) => [agentId, 0]));
    state.npcVoteHints = [];
    state.activePairings = {};
    state.nextPairingMinutes = DEDUCTION_DAY_START_MINUTES + 16;
    if (state.shapeshifterSkills) {
      state.shapeshifterSkills = createShapeshifterSkillState(state.shapeshifterSkills);
    }
    state.nightMessage =
      state.playerSide === 'shapeshifter'
        ? `Day ${state.day}: keep asking questions and identify the mayor. Suspicion ${state.playerSuspicion}/100.`
        : `Day ${state.day}: the mayor is ${this.deductionMayorName}. Find the remaining shapeshifter(s).`;
    this.timeMinutes = DEDUCTION_DAY_START_MINUTES;
    this.paused = false;
    this.player.dialogue = undefined;
    this.agents = this.agents.filter((agent) => state.aliveAgentIds.includes(agent.id));
    for (const agent of this.agents) {
      agent.conversationCooldown = 2 + Math.random() * 3;
      agent.nextDecisionIn = 0.3 + Math.random();
      if (agent.mobility !== 'counterBound') {
        this.applyDeductionRoamingPlan(agent);
      }
    }
    this.addLog(`Day ${state.day} began. Questions reset to ${state.playerDialogueLimit}.`);
    this.updatePlayerInteractionHint(true);
  }

  private skillLabel(skillId: ShapeshifterSkillId): string {
    if (skillId === 'listen') return 'Listen';
    if (skillId === 'forge') return 'Forge';
    return 'Lure';
  }

  private useListenSkill(targetAgent: Agent): void {
    const state = this.deduction;
    if (!state?.shapeshifterSkills) {
      return;
    }

    const recentRecord = state.dialogueHistory.find(
      (record) => record.speakerId === targetAgent.id || record.listenerId === targetAgent.id,
    );
    const summary = recentRecord
      ? `You overheard ${targetAgent.name}'s recent talk: ${recentRecord.topic}`
      : `You watched ${targetAgent.name} and found no useful conversation yet.`;
    const clue = this.addEvidenceClue({
      type: recentRecord?.tags.includes('mayorMisdirection') ? 'mayorMisdirection' : 'playerProbe',
      summary,
      relatedAgentIds: [targetAgent.id],
      sourceDialogueId: recentRecord?.id,
      weight: recentRecord ? 3 : 1,
      tags: ['skill', 'listen', 'private'],
      privateToPlayer: true,
    });
    state.shapeshifterSkills.privateClueIds.push(clue.id);
    state.shapeshifterSkills.lastSkillMessage = summary;
    this.addLog(`Listen skill: ${summary}`);
  }

  private useForgeSkill(targetAgent: Agent): void {
    const state = this.deduction;
    if (!state?.shapeshifterSkills) {
      return;
    }

    const summary = `A forged note suggests ${targetAgent.name} asked about the mayor's private route.`;
    const clue = this.addEvidenceClue({
      type: 'contradiction',
      summary,
      relatedAgentIds: [targetAgent.id],
      weight: 4,
      tags: ['skill', 'forge', 'privateMayorProbe'],
      forged: true,
    });
    state.shapeshifterSkills.privateClueIds.push(clue.id);
    state.shapeshifterSkills.lastSkillMessage = `You forged suspicion against ${targetAgent.name}.`;
    this.addSuspicionForAllTownObservers(targetAgent.id, 2.6, 'forged clue');
    this.addLog(`Forge skill: ${targetAgent.name} was framed with a suspicious clue.`);
  }

  private useLureSkill(targetAgent: Agent, locationId: LocationId): void {
    const state = this.deduction;
    if (!state?.shapeshifterSkills || targetAgent.mobility === 'counterBound') {
      if (state?.shapeshifterSkills) {
        state.shapeshifterSkills.lastSkillMessage = `${targetAgent.name} cannot be lured away from the counter.`;
      }
      return;
    }

    targetAgent.destination = locationId;
    targetAgent.currentGoal = `Follow a suspicious lead to ${LOCATION_BY_ID[locationId].name}`;
    targetAgent.currentAction = `walking to ${LOCATION_BY_ID[locationId].name}`;
    targetAgent.plannedAction = targetAgent.currentAction;
    targetAgent.reason = `A rumor drew me toward ${LOCATION_BY_ID[locationId].name}.`;
    targetAgent.lastPlan = `Lured by a shapeshifter skill toward ${LOCATION_BY_ID[locationId].name}.`;
    targetAgent.nextPlan = `Check ${LOCATION_BY_ID[locationId].name}, then resume normal deduction movement.`;
    targetAgent.currentPath = [];
    targetAgent.pathIndex = 0;
    targetAgent.conversationCooldown = Math.min(targetAgent.conversationCooldown, 2);
    this.computePathToDestination(targetAgent);

    const summary = `You lured ${targetAgent.name} toward ${LOCATION_BY_ID[locationId].name}.`;
    this.addEvidenceClue({
      type: 'trustShift',
      summary,
      relatedAgentIds: [targetAgent.id],
      weight: 2,
      tags: ['skill', 'lure', locationId],
      privateToPlayer: true,
    });
    state.shapeshifterSkills.lastSkillMessage = summary;
    this.addLog(`Lure skill: ${summary}`);
  }

  private addEvidenceClue(input: Omit<EvidenceClue, 'id' | 'day' | 'timeLabel'>): EvidenceClue {
    const state = this.deduction;
    const clue: EvidenceClue = {
      id: `evidence-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      day: state?.day ?? 1,
      timeLabel: this.timeLabel,
      ...input,
      tags: [...new Set(input.tags)],
    };

    if (!state) {
      return clue;
    }

    const duplicate = state.evidenceBoard.some(
      (candidate) =>
        candidate.sourceDialogueId === clue.sourceDialogueId &&
        candidate.type === clue.type &&
        candidate.summary === clue.summary,
    );
    if (!duplicate) {
      state.evidenceBoard.unshift(clue);
      state.evidenceBoard = state.evidenceBoard.slice(0, 220);
      this.updateNpcSuspicionFromClue(clue);
    }
    return clue;
  }

  private createEvidenceFromDialogue(record: DeductionDialogueRecord): void {
    const relatedAgentIds = [record.speakerId, record.listenerId].filter((id) => id !== 'player');
    const source = {
      relatedAgentIds,
      sourceDialogueId: record.id,
    };

    if (record.tags.includes('privateMayorProbe')) {
      this.addEvidenceClue({
        ...source,
        type: 'privateRouteProbe',
        summary: `${record.speakerName} raised a private mayor route or residence question with ${record.listenerName}.`,
        weight: 5,
        tags: ['deduction', 'private-route', ...record.tags],
      });
    }

    if (record.tags.includes('mayorMisdirection')) {
      this.addEvidenceClue({
        ...source,
        type: 'mayorMisdirection',
        summary: `${record.speakerName} may have redirected mayor business toward another townsfolk.`,
        weight: 4,
        tags: ['deduction', 'misdirection', ...record.tags],
      });
    }

    if (record.tags.includes('roleGroundedMayorQuestion')) {
      this.addEvidenceClue({
        ...source,
        type: 'roleGroundedReason',
        summary: `${record.speakerName} had a role-grounded reason to ask about the mayor.`,
        weight: 1,
        tags: ['deduction', 'role-reason', ...record.tags],
      });
    } else if (record.tags.includes('mayorQuestion') || record.tags.includes('repeatedMayorProbe')) {
      this.addEvidenceClue({
        ...source,
        type: 'mayorQuestion',
        summary: `${record.speakerName} asked about mayor-related information.`,
        weight: record.tags.includes('repeatedMayorProbe') ? 3 : 2,
        tags: ['deduction', 'mayor-question', ...record.tags],
      });
    }

    if (record.tags.includes('playerShapeshifterQuestion')) {
      this.addEvidenceClue({
        ...source,
        type: 'playerProbe',
        summary: `${this.player.profile.name} probed ${record.listenerName} for mayor information.`,
        weight: 3,
        tags: ['deduction', 'player-probe', ...record.tags],
      });
    }
  }

  private updateNpcSuspicionFromClue(clue: EvidenceClue): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    const [speakerId, listenerId] = clue.relatedAgentIds;
    const targetId =
      clue.type === 'playerProbe'
        ? PLAYER_SUSPICION_TARGET_ID
        : speakerId && state.aliveAgentIds.includes(speakerId)
          ? speakerId
          : clue.relatedAgentIds.find((agentId) => state.aliveAgentIds.includes(agentId));
    if (!targetId) {
      return;
    }

    const baseDelta =
      clue.type === 'privateRouteProbe'
        ? 3.4
        : clue.type === 'contradiction'
          ? 2.8
          : clue.type === 'mayorQuestion'
            ? 1.4
            : clue.type === 'mayorMisdirection'
              ? 1.2
              : clue.type === 'roleGroundedReason'
                ? -0.6
                : clue.type === 'playerProbe'
                  ? 2.2
                  : clue.type === 'nightKill'
                    ? 1.4
                    : 0.8;

    if (targetId === PLAYER_SUSPICION_TARGET_ID) {
      if (state.playerSide === 'shapeshifter') {
        const modifier = this.playerSuspicionModifier();
        state.playerSuspicion = Math.min(DEDUCTION_PLAYER_SUSPICION_LIMIT, state.playerSuspicion + Math.max(0, baseDelta * 2.2 * modifier));
        this.addSuspicionForAllTownObservers(targetId, Math.max(0.8, baseDelta * modifier), clue.summary);
      }
      return;
    }

    const observers = listenerId && listenerId !== targetId && state.aliveAgentIds.includes(listenerId)
      ? [listenerId]
      : state.aliveAgentIds.filter((agentId) => agentId !== targetId).slice(0, 4);
    for (const observerId of observers) {
      this.addSuspicion(observerId, targetId, baseDelta, clue.summary);
    }
  }

  private addSuspicionForAllTownObservers(targetId: string, delta: number, reason: string): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    for (const observerId of state.aliveAgentIds) {
      this.addSuspicion(observerId, targetId, delta, reason);
    }
  }

  private addSuspicion(observerId: string, targetId: string, delta: number, _reason: string): void {
    const state = this.deduction;
    if (!state || observerId === targetId || !Number.isFinite(delta)) {
      return;
    }

    const current = state.npcSuspicion[observerId] ?? {};
    current[targetId] = Math.max(0, Math.min(12, (current[targetId] ?? 0) + delta));
    state.npcSuspicion[observerId] = current;
  }

  private averagePlayerTrust(): number {
    const relationships = this.agents
      .map((agent) => agent.relationships.player)
      .filter((relationship): relationship is { familiarity: number; trust: number; affinity: number } => Boolean(relationship));
    if (relationships.length === 0) {
      return 0;
    }

    return relationships.reduce((sum, relationship) => sum + relationship.trust, 0) / relationships.length;
  }

  private playerSuspicionModifier(): number {
    const reputationRelief = Math.min(0.22, this.player.stats.reputation / 500);
    const trustRelief = Math.min(0.25, this.averagePlayerTrust() / 240);
    const lowTrustPenalty = this.averagePlayerTrust() < 8 ? 0.12 : 0;
    return Math.max(0.58, Math.min(1.32, 1 - reputationRelief - trustRelief + lowTrustPenalty));
  }

  private computeNightVoteHints(): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    const entries = Object.entries(state.npcSuspicion)
      .flatMap(([observerId, targets]) =>
        Object.entries(targets).map(([targetId, score]) => ({
          observerId,
          targetId,
          score,
        })),
      )
      .filter((entry) => entry.score >= 1.6)
      .filter((entry) => state.aliveAgentIds.includes(entry.observerId))
      .filter((entry) => entry.targetId === PLAYER_SUSPICION_TARGET_ID || state.aliveAgentIds.includes(entry.targetId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    state.npcVoteHints = entries.map((entry, index) => {
      const observer = this.agents.find((agent) => agent.id === entry.observerId);
      const target = entry.targetId === PLAYER_SUSPICION_TARGET_ID
        ? undefined
        : this.agents.find((agent) => agent.id === entry.targetId);
      const targetName = entry.targetId === PLAYER_SUSPICION_TARGET_ID ? this.player.profile.name : target?.name ?? 'someone';
      const relatedClue = state.evidenceBoard.find((clue) => clue.relatedAgentIds.includes(entry.targetId));
      return {
        id: `vote-hint-${state.day}-${index}-${entry.observerId}-${entry.targetId}`,
        day: state.day,
        observerId: entry.observerId,
        targetId: entry.targetId,
        observerName: observer?.name ?? 'Someone',
        targetName,
        reason: relatedClue?.summary ?? `${targetName} acted suspiciously during today's conversations.`,
        score: entry.score,
        tags: relatedClue?.tags ?? ['suspicion'],
      };
    });
  }

  private upsertDeductionDayRecap(nightOutcome?: string): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    const dayEvidence = state.evidenceBoard.filter((clue) => clue.day === state.day);
    const dayDialogues = state.dialogueHistory.filter((record) => record.day === state.day);
    const strongestHint = state.npcVoteHints[0];
    const completedRequests = this.player.requests.filter((request) => request.status === 'completed').length;
    const activeRequests = this.player.requests.filter((request) => request.status === 'active').length;
    const summary =
      state.playerSide === 'shapeshifter'
        ? `You questioned townsfolk as the hidden shapeshifter. Suspicion is ${Math.round(state.playerSuspicion)}/100.`
        : `You protected ${this.deductionMayorName} while the town compared claims.`;
    const recap: DeductionDayRecap = {
      id: `recap-day-${state.day}`,
      day: state.day,
      title: `Day ${state.day} Recap`,
      summary,
      evidenceCount: dayEvidence.length,
      dialogueCount: dayDialogues.length,
      topSuspicion: strongestHint
        ? `${strongestHint.observerName} suspects ${strongestHint.targetName}: ${strongestHint.reason}`
        : 'No strong suspicion emerged.',
      nightOutcome,
      requestSummary: `${completedRequests} requests completed, ${activeRequests} active.`,
    };

    const existingIndex = state.dayRecaps.findIndex((candidate) => candidate.day === state.day);
    if (existingIndex >= 0) {
      state.dayRecaps[existingIndex] = {
        ...state.dayRecaps[existingIndex],
        ...recap,
        nightOutcome: nightOutcome ?? state.dayRecaps[existingIndex].nightOutcome,
      };
      return;
    }

    state.dayRecaps.unshift(recap);
  }

  private pickShapeshifterKillTarget(): string | undefined {
    const state = this.deduction;
    if (!state) {
      return undefined;
    }

    const candidates = state.aliveAgentIds.filter((agentId) => !state.shapeshifterIds.includes(agentId));
    if (candidates.length === 0) {
      return undefined;
    }

    const suspicionEntries = state.shapeshifterIds
      .flatMap((shapeshifterId) => Object.entries(state.shapeshifterMayorSuspicion[shapeshifterId] ?? {}))
      .filter(([agentId]) => candidates.includes(agentId))
      .sort(([, firstScore], [, secondScore]) => secondScore - firstScore);
    if (suspicionEntries[0] && suspicionEntries[0][1] >= 3 && Math.random() < 0.72) {
      return suspicionEntries[0][0];
    }

    const mayorRisk = Math.min(0.75, 0.3 + state.day * 0.12);
    if (candidates.includes(state.mayorAgentId) && Math.random() < mayorRisk) {
      return state.mayorAgentId;
    }

    return shuffled(candidates)[0];
  }

  private removeAgentFromWorld(agentId: string, reason: string): void {
    const agent = this.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return;
    }

    agent.isAlive = false;
    agent.currentPath = [];
    agent.pathIndex = 0;
    agent.currentAction = 'missing';
    agent.currentGoal = reason;
    agent.reason = reason;
    agent.speechBubble = { text: reason, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
    agent.emoteState = { kind: 'sad', source: 'system', expiresAtMs: this.elapsedMs + EMOTE_DURATION_MS, message: reason };
  }

  private applyDeductionRoamingPlan(agent: Agent): void {
    const destinations: LocationId[] = ['townSquare', 'park', 'library', 'cafe', 'inn', 'school', 'dock', 'postOffice'];
    const pairing = this.deduction?.activePairings[agent.id];
    const destination =
      pairing && pairing.untilMinutes > this.timeMinutes
        ? pairing.locationId
        : destinations[stableIndex(agent.id, destinations.length, Math.floor(this.timeMinutes) + (this.deduction?.day ?? 1))];
    const suspiciousAction = pairing ? 'meeting another townsfolk' : 'watching for suspicious behavior';
    agent.destination = destination;
    agent.currentGoal = 'Survive the day and identify suspicious behavior';
    agent.plannedAction = suspiciousAction;
    agent.currentAction = suspiciousAction;
    agent.reason =
      'A deduction round is active, so I am moving around and listening carefully.';
    agent.lastPlan = `Deduction mode plan: ${agent.reason}`;
    agent.nextPlan = pairing
      ? `Meet another townsfolk at ${LOCATION_BY_ID[destination].name}.`
      : `Move to ${LOCATION_BY_ID[destination].name} and compare clues.`;
    agent.currentPath = [];
    agent.pathIndex = 0;
    this.computePathToDestination(agent);
  }

  private lockAgentForPlayerDialogue(agent: Agent): void {
    agent.isMoving = false;
    agent.animationState = `idle-${agent.facing}`;
    agent.currentAction = `talking with ${this.player.profile.name}`;
    agent.lastAction = `Talking with ${this.player.profile.name}; movement paused.`;
  }

  private updatePlayerDirective(agent: Agent): boolean {
    const directive = agent.playerDirective;
    if (!directive) {
      return false;
    }

    if (agent.mobility === 'counterBound') {
      agent.playerDirective = undefined;
      this.lockCounterAgent(agent);
      this.addLog(`${agent.name} cannot leave the counter because they must stay at their post.`);
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

    if (directive.kind === 'inspectLocation') {
      return this.updateInspectDirective(agent, directive);
    }

    if (directive.kind === 'returnHomeLocation') {
      return this.updateReturnDirective(agent, directive);
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

  private updateInspectDirective(
    agent: Agent,
    directive: Extract<NonNullable<Agent['playerDirective']>, { kind: 'inspectLocation' }>,
  ): boolean {
    agent.destination = directive.targetLocationId;
    agent.currentGoal = `Inspect ${LOCATION_BY_ID[directive.targetLocationId].name}`;
    agent.plannedAction = `checking ${LOCATION_BY_ID[directive.targetLocationId].name}`;
    agent.reason = directive.reason;
    agent.lastPlan = `Player-command action: ${directive.reason}`;
    agent.nextPlan = `Checking ${LOCATION_BY_ID[directive.targetLocationId].name}, then returning to my post.`;

    if (!this.isAtDestination(agent, directive.targetLocationId)) {
      if (agent.currentPath.length === 0 || agent.pathIndex >= agent.currentPath.length) {
        this.computePathToDestination(agent);
      }
      return true;
    }

    if (!directive.inspectionDone) {
      directive.inspectionDone = true;
      const supported = this.isPlayerClaimSupported(directive.targetLocationId, directive.claim ?? '');
      const targetName = LOCATION_BY_ID[directive.targetLocationId].name;
      if (supported) {
        this.adjustPlayerRelationship(agent, { familiarity: 1, trust: 2, affinity: 1 });
        agent.relationshipDeltaReason = `Verified ${this.player.profile.name}'s claim at ${targetName}.`;
        this.showAgentEmote(agent, 'surprise', 'system', 'Verified player claim.');
        remember(agent, `I inspected ${targetName} and found evidence supporting the player's claim.`, this.timeMinutes, 'event', 4, [
          'player-command',
          'verified-claim',
        ], ['player']);
        this.addLog(`${agent.name} inspected ${targetName} and found supporting evidence.`);
      } else {
        this.adjustPlayerRelationship(agent, { familiarity: 1, trust: -2, affinity: -1 });
        agent.relationshipDeltaReason = `Could not verify ${this.player.profile.name}'s claim at ${targetName}.`;
        this.showAgentEmote(agent, 'angry', 'system', 'Unverified player claim.');
        remember(agent, `I inspected ${targetName} but found no evidence for the player's claim: ${directive.claim ?? 'unknown claim'}.`, this.timeMinutes, 'event', 4, [
          'player-command',
          'unverified-claim',
        ], ['player']);
        this.addLog(`${agent.name} inspected ${targetName}, found no evidence, and now trusts ${this.player.profile.name} less.`);
      }

      const returnLocationId = directive.returnLocationId ?? agent.homeLocationId;
      if (returnLocationId) {
        agent.playerDirective = {
          kind: 'returnHomeLocation',
          reason: `Return to ${LOCATION_BY_ID[returnLocationId].name} after inspection.`,
          startedAtMinutes: this.timeMinutes,
          untilMinutes: this.timeMinutes + INSPECT_DIRECTIVE_DURATION_MINUTES,
          targetLocationId: returnLocationId,
        };
        agent.destination = returnLocationId;
        agent.currentPath = [];
        agent.pathIndex = 0;
        this.computePathToDestination(agent);
        return true;
      }

      agent.playerDirective = undefined;
      agent.nextDecisionIn = 0.1;
    }

    return true;
  }

  private updateReturnDirective(
    agent: Agent,
    directive: Extract<NonNullable<Agent['playerDirective']>, { kind: 'returnHomeLocation' }>,
  ): boolean {
    agent.destination = directive.targetLocationId;
    agent.currentGoal = `Return to ${LOCATION_BY_ID[directive.targetLocationId].name}`;
    agent.plannedAction = `returning to ${LOCATION_BY_ID[directive.targetLocationId].name}`;
    agent.reason = directive.reason;
    agent.lastPlan = directive.reason;
    agent.nextPlan = `Returning after a player-command inspection.`;

    if (!this.isAtDestination(agent, directive.targetLocationId)) {
      if (agent.currentPath.length === 0 || agent.pathIndex >= agent.currentPath.length) {
        this.computePathToDestination(agent);
      }
      return true;
    }

    agent.playerDirective = undefined;
    agent.nextDecisionIn = 0.1;
    agent.currentPath = [];
    agent.pathIndex = 0;
    agent.lastAction = `Returned to ${LOCATION_BY_ID[directive.targetLocationId].name}.`;
    this.addLog(`${agent.name} returned to ${LOCATION_BY_ID[directive.targetLocationId].name} after checking the player report.`);
    return false;
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

    const nearbyPlant = this.getNearestHarvestablePlant();
    if (nearbyPlant) {
      this.player.interactionHint = {
        kind: 'object',
        targetId: nearbyPlant.id,
        locationId: 'farm',
        label: `Press E to gather ${nearbyPlant.displayName}`,
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

  private getNearestHarvestablePlant() {
    return HARVESTABLE_PLANTS.map((plant) => ({
      plant,
      distance: worldDistance(this.player.position, {
        x: plant.x + plant.width / 2,
        y: plant.y + plant.height / 2,
      }),
    }))
      .filter((entry) => entry.distance <= PLAYER_HARVEST_DISTANCE && !this.harvestedPlantIds.has(entry.plant.id))
      .sort((a, b) => a.distance - b.distance)[0]?.plant;
  }

  private tryHarvestPlant(plantId: string): void {
    const plant = HARVESTABLE_PLANTS.find((candidate) => candidate.id === plantId);
    if (!plant || this.harvestedPlantIds.has(plant.id)) {
      return;
    }

    this.harvestedPlantIds.add(plant.id);
    const existing = this.player.inventory.find((item) => item.id === plant.itemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.player.inventory.push({
        id: plant.itemId,
        name: plant.displayName,
        quantity: 1,
        category: 'food',
      });
    }
    this.player.gold += 1;
    this.player.stats.curiosity = clampStat(this.player.stats.curiosity + 2);
    this.addLog(`${this.player.profile.name} gathered ${plant.displayName} at the Farm. Harvest interface placeholder recorded.`);
    this.tryCompletePlayerRequests({ kind: 'gatherItem', itemId: plant.itemId });
    this.updatePlayerInteractionHint(true);
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
    this.tryCompletePlayerRequests({ kind: 'visitLocation', locationId });
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

    if (locationId === 'library' || locationId === 'school' || locationId === 'studio') {
      this.player.stats.curiosity = clampStat(this.player.stats.curiosity + 8);
      this.addLog(`${this.player.profile.name} explored ${location.name} and found useful local context.`);
      return;
    }

    if (locationId === 'farm') {
      this.player.stats.hunger = clampStat(this.player.stats.hunger + 8);
      this.player.stats.curiosity = clampStat(this.player.stats.curiosity + 5);
      this.addLog(`${this.player.profile.name} checked the Farm rows. Individual plants can be gathered nearby.`);
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
    this.tryCompletePlayerRequests({ kind: 'talkToRole', role: agent.role, agentId: agent.id });
  }

  private handlePlayerRequestDialogue(agent: Agent, playerMessage = ''): void {
    const dialogue = this.player.dialogue;
    if (!dialogue || dialogue.npcId !== agent.id) {
      return;
    }

    if (this.deduction) {
      const line = `${agent.name}: Not during this deduction round. We need to focus on who is lying.`;
      this.player.dialogue = {
        ...dialogue,
        npcLine: line,
        playerIntent: 'Ask for a role request',
        npcIntent: 'Decline side requests during deduction mode',
        awaitingLLM: false,
        turns: [
          ...dialogue.turns,
          { speaker: 'player' as const, text: 'Do you need help?', timeLabel: this.timeLabel },
          { speaker: 'npc' as const, text: line, timeLabel: this.timeLabel },
        ].slice(-8),
      };
      return;
    }

    const active = this.player.requests.find((request) => request.giverAgentId === agent.id && request.status === 'active');
    const completed = this.player.requests.find((request) => request.giverAgentId === agent.id && request.status === 'completed');
    const request = active ?? completed ?? this.createRoleRequest(agent);
    if (!active && !completed) {
      this.player.requests.unshift(request);
      this.player.requests = this.player.requests.slice(0, 8);
      this.addLog(`${agent.name} gave ${this.player.profile.name} a request: ${request.title}.`);
    }

    const line =
      request.status === 'completed'
        ? `${agent.name}: Thanks again for finishing "${request.title}".`
        : `${agent.name}: ${request.description} Reward: ${request.rewardGold}g and ${request.rewardReputation} reputation.`;
    const playerTurn = playerMessage.trim() || 'Do you need help with anything?';
    this.player.dialogue = {
      ...dialogue,
      npcLine: line,
      playerIntent: 'Ask for a role request',
      npcIntent: request.status === 'completed' ? 'Thank player for completed request' : 'Offer a role-based town request',
      awaitingLLM: false,
      turns: [
        ...dialogue.turns,
        { speaker: 'player' as const, text: playerTurn, timeLabel: this.timeLabel },
        { speaker: 'npc' as const, text: line, timeLabel: this.timeLabel },
      ].slice(-8),
    };
    agent.speechBubble = { text: line.replace(`${agent.name}:`, '').trim(), expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
    this.adjustPlayerRelationship(agent, { familiarity: 2, trust: 1, affinity: 0 });
  }

  private createRoleRequest(agent: Agent): PlayerRequestState {
    const role = agent.role.toLowerCase();
    const baseId = `request-${agent.id}-${Date.now()}`;
    const rewardGold = agent.tradeProfile?.enabled ? 8 : 6;
    const rewardReputation = agent.mobility === 'roaming' ? 4 : 3;

    if (/farmer|grocer|baker|chef|cafe|restaurant|innkeeper/i.test(agent.role)) {
      const plant = HARVESTABLE_PLANTS.length > 0
        ? HARVESTABLE_PLANTS[stableIndex(agent.id, HARVESTABLE_PLANTS.length, Math.floor(this.timeMinutes))]
        : undefined;
      if (!plant) {
        return {
          id: baseId,
          title: `${agent.name}'s farm check`,
          description: `Please visit the Farm and check whether the crop rows need help.`,
          kind: 'visitLocation',
          status: 'active',
          giverAgentId: agent.id,
          giverName: agent.name,
          targetLocationId: 'farm',
          progress: 0,
          required: 1,
          rewardGold,
          rewardReputation,
        };
      }
      return {
        id: baseId,
        title: `${agent.name}'s fresh produce request`,
        description: `Please gather ${plant.displayName} from the Farm and bring it back for ${agent.role} work.`,
        kind: 'gatherItem',
        status: 'active',
        giverAgentId: agent.id,
        giverName: agent.name,
        targetItemId: plant.itemId,
        targetLocationId: 'farm',
        progress: this.inventoryQuantity(plant.itemId),
        required: 1,
        rewardGold,
        rewardReputation,
      };
    }

    const targetLocationId: LocationId = role.includes('doctor')
      ? 'clinic'
      : role.includes('teacher')
        ? 'school'
        : role.includes('librarian')
          ? 'library'
          : role.includes('mechanic')
            ? 'workshop'
            : role.includes('postal')
              ? 'postOffice'
              : role.includes('harbor')
                ? 'dock'
                : role.includes('artist')
                  ? 'studio'
                  : 'townSquare';
    return {
      id: baseId,
      title: `${agent.name}'s town check`,
      description: `Please visit ${LOCATION_BY_ID[targetLocationId].name} and check whether anything needs attention for my ${agent.role} work.`,
      kind: 'visitLocation',
      status: 'active',
      giverAgentId: agent.id,
      giverName: agent.name,
      targetLocationId,
      progress: 0,
      required: 1,
      rewardGold,
      rewardReputation,
    };
  }

  private inventoryQuantity(itemId: string): number {
    return this.player.inventory.find((item) => item.id === itemId)?.quantity ?? 0;
  }

  private tryCompletePlayerRequests(
    event: { kind: 'visitLocation'; locationId: LocationId } | { kind: 'gatherItem'; itemId: string } | { kind: 'talkToRole'; role: string; agentId: string },
  ): void {
    for (const request of this.player.requests) {
      if (request.status === 'completed') {
        continue;
      }

      if (request.kind === 'visitLocation' && event.kind === 'visitLocation' && request.targetLocationId === event.locationId) {
        request.progress = request.required;
      }

      if (request.kind === 'gatherItem' && event.kind === 'gatherItem' && request.targetItemId === event.itemId) {
        request.progress = Math.min(request.required, this.inventoryQuantity(event.itemId));
      }

      if (
        request.kind === 'talkToRole' &&
        event.kind === 'talkToRole' &&
        request.targetRoleKeyword &&
        event.role.toLowerCase().includes(request.targetRoleKeyword.toLowerCase()) &&
        event.agentId !== request.giverAgentId
      ) {
        request.progress = request.required;
      }

      if (request.progress >= request.required) {
        this.completePlayerRequest(request);
      }
    }
  }

  private completePlayerRequest(request: PlayerRequestState): void {
    if (request.status === 'completed') {
      return;
    }

    request.status = 'completed';
    this.player.gold += request.rewardGold;
    this.player.stats.reputation = clampStat(this.player.stats.reputation + request.rewardReputation);
    const giver = this.agents.find((agent) => agent.id === request.giverAgentId);
    if (giver) {
      this.adjustPlayerRelationship(giver, { familiarity: 4, trust: 4, affinity: 2 });
      giver.relationshipDeltaReason = `${this.player.profile.name} completed "${request.title}".`;
      remember(
        giver,
        `${this.player.profile.name} completed my request: ${request.title}.`,
        this.timeMinutes,
        'event',
        3,
        ['player-request', 'completed'],
        ['player'],
      );
    }
    this.addLog(`Request complete: ${request.title}. Reward ${request.rewardGold}g, +${request.rewardReputation} reputation.`);
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
    const urgentLike = /fire|danger|emergency|着火|著火|火灾|火災|危险|危險|紧急|緊急/i.test(playerMessage);
    const affectionateLike = /enjoy|love|like|happy|喜欢|喜歡|爱|愛|开心|開心/i.test(playerMessage);
    const inferredTarget = this.inferDirectiveTargetLocation(playerMessage);
    if (this.deduction) {
      const mayorQuestion = /mayor|镇长|鎮長|leader|where.*live|住哪|住在哪里/i.test(playerMessage);
      const clearMayorQuestion = mayorQuestion || /镇长|鎮長|市长|住哪|住在哪里|行程|路线/.test(playerMessage);
      if (this.deduction.playerSide === 'shapeshifter' && agent.deductionRole === 'mayor' && clearMayorQuestion) {
        const decoy = this.pickMayorDecoy(agent.id);
        if (decoy) {
          this.registerMayorMisdirection(agent, agent, decoy);
          return {
            npcLine: `${agent.name}: I am not sure, but ${decoy.name} often handles mayor business after dusk.`,
            playerIntent: playerMessage || 'Question NPC during deduction round',
            npcIntent: 'Misdirect a possible shapeshifter away from the real mayor',
            emoteIntent: 'question',
            urgency: 'normal',
            relationshipDelta: { familiarity: 1, trust: 0, affinity: 0 },
            memoryToWrite: `${this.player.profile.name} asked me about the mayor during the deduction round.`,
          };
        }
      }
      if (agent.deductionRole === 'shapeshifter') {
        return {
          npcLine: clearMayorQuestion
            ? `${agent.name}: I only ask because keeping the mayor safe matters. Where did you last see them?`
            : `${agent.name}: Interesting. Did anyone mention the mayor's route today?`,
          playerIntent: playerMessage || 'Question NPC during deduction round',
          npcIntent: 'Probe for mayor information while sounding helpful',
          emoteIntent: 'question',
          urgency: 'normal',
          relationshipDelta: { familiarity: 1, trust: 0, affinity: 0 },
          memoryToWrite: `${this.player.profile.name} questioned me during the deduction round.`,
        };
      }

      return {
        npcLine: clearMayorQuestion && this.roleMayNeedMayor(agent)
          ? `${agent.name}: I might need the mayor for work: ${this.mayorNeedForRole(agent)}`
          : `${agent.name}: I am watching for anyone who asks about the mayor without a clear reason.`,
        playerIntent: playerMessage || 'Question NPC during deduction round',
        npcIntent: clearMayorQuestion && this.roleMayNeedMayor(agent) ? 'Explain role-grounded reason to find the mayor' : 'Share suspicion about weakly motivated mayor questions',
        emoteIntent: agent.deductionRole === 'mayor' ? 'message' : 'neutral',
        urgency: 'normal',
        relationshipDelta: { familiarity: 1, trust: 1, affinity: 0 },
        memoryToWrite: `${this.player.profile.name} asked me about suspicious behavior during the deduction round.`,
      };
    }

    return {
      npcLine: eventLike
        ? `${agent.name}: That sounds important. I will keep the event in mind.`
        : followLike
          ? `${agent.name}: I will follow you. Lead the way.`
          : urgentLike
            ? `${agent.name}: That sounds serious. I will check it and come back.`
        : `${agent.name}: I see. That may affect what I do next.`,
      playerIntent: playerMessage || 'Free-form conversation',
      npcIntent: followLike
        ? 'Follow the player as requested'
        : urgentLike
          ? 'Inspect the player-reported urgent situation'
          : eventLike
            ? 'Evaluate a player-mentioned event'
            : 'Respond to player conversation',
      actionText: urgentLike ? `Inspect ${inferredTarget ? LOCATION_BY_ID[inferredTarget].name : 'Town Square'} and return afterward.` : undefined,
      emoteIntent: affectionateLike ? 'heart' : urgentLike ? 'surprise' : undefined,
      urgency: urgentLike ? 'high' : 'normal',
      targetLocation: urgentLike ? inferredTarget ?? 'townSquare' : undefined,
      relationshipDelta: { familiarity: 2, trust: urgentLike ? 0 : 1, affinity: affectionateLike ? 2 : 1 },
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
        deductionContext: this.buildDeductionDialogueContext(agent),
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

  private buildDeductionDialogueContext(agent: Agent): LLMPlayerDialogueRequest['deductionContext'] {
    if (!this.deduction) {
      return undefined;
    }

    const hiddenInstruction =
      agent.deductionRole === 'shapeshifter'
        ? 'You are secretly a shapeshifter. You need to discover who the mayor is and where they stay, but you must never admit you are a shapeshifter. Leave subtle tells: ask too much about mayor routines, safe rooms, or who is alone.'
        : agent.deductionRole === 'mayor'
          ? this.deduction.playerSide === 'shapeshifter'
            ? 'You are secretly the mayor. The player may be a shapeshifter. If asked about mayor identity, residence, schedule, or routes, misdirect by naming another plausible NPC and do not reveal yourself.'
            : 'You are secretly the mayor. The player knows this. Keep a low profile and do not reveal your identity to other NPCs. If suspicious people ask about your residence or route, misdirect them toward another plausible NPC.'
          : `You are a normal townsfolk. You may ask where the mayor is only for a concrete role-grounded reason: ${this.mayorNeedForRole(agent)} Notice if someone repeatedly asks about the mayor, the mayor residence, routes, or who is alone without a good reason.`;

    return {
      enabled: true,
      day: this.deduction.day,
      phase: this.deduction.phase,
      playerSide: this.deduction.playerSide,
      playerKnowsMayorName: this.deduction.playerSide === 'protector' ? this.deductionMayorName : undefined,
      aliveNames: this.deductionAliveAgents.map((candidate) => candidate.name),
      hiddenInstruction,
      playerDialoguesRemaining: Math.max(0, this.deduction.playerDialogueLimit - this.deduction.playerDialoguesUsed),
    };
  }

  private normalizePlayerDialogue(
    data: LLMPlayerDialogueResult,
    fallback: LLMPlayerDialogueResult,
  ): LLMPlayerDialogueResult {
    return {
      npcLine: data.npcLine?.trim() || fallback.npcLine,
      playerIntent: data.playerIntent?.trim() || fallback.playerIntent,
      npcIntent: data.npcIntent?.trim() || fallback.npcIntent,
      actionText: data.actionText?.trim() || fallback.actionText,
      emoteIntent: data.emoteIntent?.trim() || fallback.emoteIntent,
      urgency: data.urgency ?? fallback.urgency,
      targetLocation: data.targetLocation?.trim() || fallback.targetLocation,
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
      this.recordDeductionPlayerDialogue(agent, result.playerIntent || playerMessage || 'Talk', npcLine, playerMessage, result);
    }

    agent.speechBubble = { text: npcLine.replace(`${agent.name}:`, '').trim(), expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
    agent.lastObservation = `${this.player.profile.name} talked to me: ${result.playerIntent}`;
    agent.lastLLMDecision = source === 'llm' ? `Player dialogue LLM intent: ${result.npcIntent}` : `Player dialogue fallback: ${result.npcIntent}`;
    this.player.stats.social = clampStat(this.player.stats.social + 8);
    this.adjustPlayerRelationship(agent, result.relationshipDelta ?? { familiarity: 1, trust: 0, affinity: 0 });
    if (result.relationshipDelta) {
      agent.relationshipDeltaReason = result.npcIntent;
    }

    if (result.memoryToWrite) {
      remember(agent, result.memoryToWrite, this.timeMinutes, 'conversation', 3, ['player-dialogue'], ['player']);
    }

    const interpreted = interpretPlayerDialogueAction(agent, result, playerMessage);
    if (interpreted.emote) {
      this.showAgentEmote(agent, interpreted.emote, source, result.npcIntent);
    }
    const acceptedInterpretedAction = this.applyInterpretedPlayerActions(agent, interpreted.actions, result, playerMessage, source);
    const acceptedFollowDirective = acceptedInterpretedAction || this.applyPlayerFollowDirective(agent, result, playerMessage, source);
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

  private showAgentEmote(
    agent: Agent,
    kind: AgentEmoteKind,
    source: 'llm' | 'fallback' | 'system',
    message?: string,
    persistent = false,
  ): void {
    agent.emoteState = {
      kind,
      source,
      message,
      expiresAtMs: persistent ? undefined : this.elapsedMs + EMOTE_DURATION_MS,
    };
  }

  private applyInterpretedPlayerActions(
    agent: Agent,
    actions: InterpretedAction[],
    result: LLMPlayerDialogueResult,
    playerMessage: string,
    source: 'llm' | 'fallback',
  ): boolean {
    let accepted = false;
    for (const action of actions) {
      if (action.kind === 'messageForPlayer') {
        agent.pendingMessage = {
          text: action.reason,
          source: source === 'llm' ? 'llm' : 'system',
          createdAtMinutes: Math.floor(this.timeMinutes),
        };
        this.showAgentEmote(agent, 'message', source, action.reason, true);
      }

      if (action.kind === 'followPlayer') {
        const followResult: LLMPlayerDialogueResult = {
          ...result,
          possiblePlanChange: {
            ...result.possiblePlanChange,
            followPlayer: true,
            targetLocation: action.targetLocationId,
            reason: action.reason,
            goal: `Follow ${this.player.profile.name}`,
            action: `following ${this.player.profile.name}`,
          },
        };
        accepted = this.applyPlayerFollowDirective(agent, followResult, playerMessage, source) || accepted;
      }

      if (action.kind === 'inspectLocation') {
        accepted = this.applyPlayerInspectDirective(agent, action, source) || accepted;
      }
    }
    return accepted;
  }

  private applyPlayerInspectDirective(
    agent: Agent,
    action: Extract<InterpretedAction, { kind: 'inspectLocation' }>,
    source: 'llm' | 'fallback',
  ): boolean {
    if (agent.mobility === 'counterBound') {
      agent.lastObservation = `${this.player.profile.name} reported something urgent, but I must stay at my counter.`;
      agent.lastLLMDecision = `${source === 'llm' ? 'LLM' : 'Fallback'} inspect request rejected by counter-bound rule.`;
      remember(
        agent,
        `${this.player.profile.name} asked me to inspect ${LOCATION_BY_ID[action.targetLocationId].name}, but counter duty prevents it.`,
        this.timeMinutes,
        'plan',
        3,
        ['player-command', 'inspect-location', 'blocked'],
        ['player'],
      );
      this.addLog(`${agent.name} cannot leave the counter to inspect ${LOCATION_BY_ID[action.targetLocationId].name}.`);
      return false;
    }

    const targetName = LOCATION_BY_ID[action.targetLocationId].name;
    const returnLocationId = agent.homeLocationId ?? agent.destination;
    agent.playerDirective = {
      kind: 'inspectLocation',
      reason: action.reason,
      startedAtMinutes: this.timeMinutes,
      untilMinutes: this.timeMinutes + INSPECT_DIRECTIVE_DURATION_MINUTES,
      targetLocationId: action.targetLocationId,
      returnLocationId,
      claim: action.claim,
    };
    agent.destination = action.targetLocationId;
    agent.currentGoal = `Inspect ${targetName}`;
    agent.plannedAction = `checking ${targetName}`;
    agent.currentAction = `checking ${targetName}`;
    agent.reason = action.reason;
    agent.lastPlan = `Player-command action: ${action.reason}`;
    agent.nextPlan = `Inspecting ${targetName}; normal planning is paused until I return.`;
    agent.currentPath = [];
    agent.pathIndex = 0;
    this.computePathToDestination(agent);
    this.showAgentEmote(agent, action.urgency === 'high' ? 'surprise' : 'question', source, action.reason);
    remember(
      agent,
      `${this.player.profile.name} asked me to inspect ${targetName}: ${action.claim}`,
      this.timeMinutes,
      'plan',
      action.urgency === 'high' ? 5 : 3,
      ['player-command', 'inspect-location', action.targetLocationId],
      ['player'],
    );
    this.addLog(`${agent.name} accepted a player instruction to inspect ${targetName}.`);
    return true;
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

  private isPlayerClaimSupported(locationId: LocationId, claim: string): boolean {
    const claimWords = claim
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/u)
      .filter((word) => word.length >= 2);
    return this.events.some((event) => {
      if (event.locationId !== locationId) {
        return false;
      }
      const eventText = `${event.title} ${event.description}`.toLowerCase();
      if (claimWords.length === 0) {
        return true;
      }
      return claimWords.some((word) => eventText.includes(word));
    });
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
    if (this.deduction) {
      const observation = this.observe(agent);
      agent.lastObservation = this.describeObservation(agent, observation);
      agent.retrievedMemories = this.retrieveMemories(agent, observation);
      this.applyDeductionRoamingPlan(agent);
      agent.lastLLMDecision = 'Deduction mode behavior: compare claims, ask grounded questions, and keep public role consistent.';
      return;
    }

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
    } else if (agent.mobility === 'buildingBound' || destinationChanged || goalChanged || agent.currentPath.length === 0) {
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
    if (agent.playerDirective?.kind === 'inspectLocation' || agent.playerDirective?.kind === 'returnHomeLocation') {
      return LOCATION_TARGETS[agent.playerDirective.targetLocationId];
    }

    if (agent.mobility === 'counterBound') {
      return agent.counterAnchor ? worldToCell(agent.counterAnchor) : LOCATION_TARGETS[agent.destination];
    }

    if (agent.mobility === 'buildingBound' && agent.homeLocationId) {
      const points = BUILDING_ACTIVITY_POINTS[agent.homeLocationId] ?? [LOCATION_TARGETS[agent.homeLocationId]];
      return points[stableIndex(agent.id, points.length, Math.floor(this.timeMinutes / 0.45))];
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
    } else if (agent.playerDirective?.kind === 'inspectLocation') {
      agent.currentAction = `checking ${LOCATION_BY_ID[agent.playerDirective.targetLocationId].name}`;
      agent.lastAction = `Inspecting ${LOCATION_BY_ID[agent.playerDirective.targetLocationId].name} along an A* path.`;
    } else if (agent.playerDirective?.kind === 'returnHomeLocation') {
      agent.currentAction = `returning to ${LOCATION_BY_ID[agent.playerDirective.targetLocationId].name}`;
      agent.lastAction = `Returning to ${LOCATION_BY_ID[agent.playerDirective.targetLocationId].name} along an A* path.`;
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
    if (agent.playerDirective?.kind === 'followPlayer') {
      agent.nextPlan = `Following ${this.player.profile.name}; normal planning is paused.`;
      return;
    }
    if (agent.playerDirective?.kind === 'inspectLocation') {
      agent.nextPlan = `Inspecting ${LOCATION_BY_ID[agent.playerDirective.targetLocationId].name}; will return afterward.`;
      return;
    }
    if (agent.playerDirective?.kind === 'returnHomeLocation') {
      agent.nextPlan = `Returning to ${LOCATION_BY_ID[agent.playerDirective.targetLocationId].name}.`;
      return;
    }
    const seconds = Math.max(0, Math.ceil(agent.nextDecisionIn));
    agent.nextPlan = `Next planning check in ${seconds}s; current target is ${LOCATION_BY_ID[agent.destination].name}.`;
  }

  private tryScheduleDeductionPairing(): void {
    const state = this.deduction;
    if (!state || state.phase !== 'day' || this.timeMinutes < state.nextPairingMinutes) {
      return;
    }

    state.nextPairingMinutes = this.timeMinutes + DEDUCTION_PAIRING_INTERVAL_MINUTES;
    const available = this.agents.filter(
      (agent) =>
        agent.isAlive !== false &&
        state.aliveAgentIds.includes(agent.id) &&
        !this.isAgentInPlayerDialogue(agent.id) &&
        (state.npcConversationCounts[agent.id] ?? 0) < state.npcConversationLimitPerAgent,
    );
    if (available.length < 2) {
      return;
    }

    const [first, second] = shuffled(available).slice(0, 2);
    const meetingLocations: LocationId[] = ['townSquare', 'park', 'cafe', 'library', 'dock', 'postOffice'];
    const locationId = meetingLocations[stableIndex(`${first.id}-${second.id}`, meetingLocations.length, state.day + Math.floor(this.timeMinutes))];
    const untilMinutes = this.timeMinutes + 75;
    state.activePairings[first.id] = { partnerId: second.id, locationId, untilMinutes };
    state.activePairings[second.id] = { partnerId: first.id, locationId, untilMinutes };

    for (const agent of [first, second]) {
      agent.conversationCooldown = Math.min(agent.conversationCooldown, 1.5);
      agent.nextDecisionIn = 0.1;
      agent.destination = locationId;
      agent.currentGoal = 'Meet another townsfolk and compare claims';
      agent.currentAction = 'heading to a deduction conversation';
      agent.reason = `A deduction round is active, so I am meeting someone at ${LOCATION_BY_ID[locationId].name}.`;
      agent.currentPath = [];
      agent.pathIndex = 0;
      this.computePathToDestination(agent);
    }

    this.addLog(`${first.name} and ${second.name} are moving to ${LOCATION_BY_ID[locationId].name} to compare clues.`);
  }

  private tryConversations(): void {
    for (let i = 0; i < this.agents.length; i += 1) {
      for (let j = i + 1; j < this.agents.length; j += 1) {
        const first = this.agents[i];
        const second = this.agents[j];

        if (first.isAlive === false || second.isAlive === false) {
          continue;
        }

        if (this.deduction && !this.canDeductionNpcConverse(first, second)) {
          continue;
        }

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

  private canDeductionNpcConverse(first: Agent, second: Agent): boolean {
    const state = this.deduction;
    if (!state || state.phase !== 'day') {
      return false;
    }

    return (
      state.aliveAgentIds.includes(first.id) &&
      state.aliveAgentIds.includes(second.id) &&
      (state.npcConversationCounts[first.id] ?? 0) < state.npcConversationLimitPerAgent &&
      (state.npcConversationCounts[second.id] ?? 0) < state.npcConversationLimitPerAgent
    );
  }

  private startConversation(first: Agent, second: Agent, location: TownLocation): void {
    const result = this.dialogueProvider.generateDialogue({
      speaker: first,
      listener: second,
      location,
      timeLabel: this.timeLabel,
      recentEvents: this.events.slice(0, 2),
    });

    first.conversationCooldown = this.deduction ? 8 + Math.random() * 2 : 18;
    second.conversationCooldown = this.deduction ? 8 + Math.random() * 2 : 18;

    const firstLine = result.lines.find((line) => line.agentId === first.id)?.text ?? result.topic;
    const secondLine = result.lines.find((line) => line.agentId === second.id)?.text ?? 'I will remember that.';
    const deductionTopic = this.deductionConversationTopic(first, second);
    const finalTopic = deductionTopic ?? result.topic;
    const finalFirstLine = deductionTopic ? this.deductionNpcLine(first, second, firstLine) : firstLine;
    const finalSecondLine = deductionTopic ? this.deductionNpcLine(second, first, secondLine) : secondLine;

    first.speechBubble = { text: finalFirstLine, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };
    second.speechBubble = { text: finalSecondLine, expiresAtMs: this.elapsedMs + BUBBLE_DURATION_MS };

    first.needs.social = clampNeed(first.needs.social + 8);
    second.needs.social = clampNeed(second.needs.social + 8);
    remember(
      first,
      `Talked with ${second.name} at ${location.name}: ${finalTopic}`,
      this.timeMinutes,
      'conversation',
      3,
      ['dialogue', location.id],
      [second.id],
    );
    remember(
      second,
      `Talked with ${first.name} at ${location.name}: ${finalTopic}`,
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
    if (this.deduction) {
      this.deduction.npcConversationCounts[first.id] = (this.deduction.npcConversationCounts[first.id] ?? 0) + 1;
      this.deduction.npcConversationCounts[second.id] = (this.deduction.npcConversationCounts[second.id] ?? 0) + 1;
      delete this.deduction.activePairings[first.id];
      delete this.deduction.activePairings[second.id];
      this.recordDeductionDialogue(first, second, location, finalTopic, [finalFirstLine, finalSecondLine], this.deductionTagsForDialogue(first, second, finalTopic, [finalFirstLine, finalSecondLine]));
    }
    this.addLog(`${first.name} and ${second.name} talked at ${location.name}: ${finalTopic}`);
    this.replayRecorder.recordDialogue(
      [first.id, second.id],
      this.timeMinutes,
      `${first.name} and ${second.name} talked at ${location.name}: ${finalTopic}`,
      [
        { speaker: first.name, text: finalFirstLine, timeLabel: this.timeLabel },
        { speaker: second.name, text: finalSecondLine, timeLabel: this.timeLabel },
      ],
    );
    if (!this.deduction) {
      this.requestLLMDialogue(first, second, location, finalTopic);
    }
  }

  private deductionConversationTopic(first: Agent, second: Agent): string | undefined {
    if (!this.deduction) {
      return undefined;
    }
    if (first.deductionRole === 'shapeshifter' || second.deductionRole === 'shapeshifter') {
      return 'one of them kept steering the conversation toward private details about the mayor';
    }
    if (this.roleMayNeedMayor(first) || this.roleMayNeedMayor(second)) {
      return 'they discussed a role-related reason to find the mayor before nightfall';
    }
    return 'they compared suspicious behavior before nightfall';
  }

  private deductionNpcLine(agent: Agent, listener: Agent, fallbackLine: string): string {
    if (agent.deductionRole === 'shapeshifter') {
      return `${agent.name}: Has anyone seen where the mayor stays after dark?`;
    }
    if (agent.deductionRole === 'mayor' && (listener.deductionRole === 'shapeshifter' || Math.random() < 0.35)) {
      const decoy = this.pickMayorDecoy(agent.id);
      if (decoy) {
        this.registerMayorMisdirection(agent, listener, decoy);
        return `${agent.name}: If you need mayor business, ${decoy.name} usually knows the official schedule.`;
      }
    }
    if (this.roleMayNeedMayor(agent)) {
      const reason = this.mayorNeedForRole(agent).replace(/^you may need/i, 'I may need');
      return `${agent.name}: ${reason}`;
    }
    return fallbackLine;
  }

  private pickMayorDecoy(excludeAgentId: string): Agent | undefined {
    const state = this.deduction;
    if (!state) {
      return undefined;
    }

    return shuffled(
      state.aliveAgentIds
        .filter((agentId) => agentId !== excludeAgentId && agentId !== state.mayorAgentId)
        .map((agentId) => this.agents.find((candidate) => candidate.id === agentId))
        .filter((agent): agent is Agent => Boolean(agent)),
    )[0];
  }

  private registerMayorMisdirection(claimant: Agent, listener: Agent, claimedMayor: Agent): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    const existing = state.mayorMisdirectionClaims.find(
      (claim) =>
        claim.claimantId === claimant.id &&
        claim.claimedMayorId === claimedMayor.id &&
        claim.listenerId === listener.id,
    );
    if (existing) {
      existing.count += 1;
      existing.day = state.day;
      existing.timeLabel = this.timeLabel;
    } else {
      state.mayorMisdirectionClaims.push({
        claimantId: claimant.id,
        claimedMayorId: claimedMayor.id,
        listenerId: listener.id,
        count: 1,
        day: state.day,
        timeLabel: this.timeLabel,
      });
    }

    if (listener.deductionRole === 'shapeshifter') {
      const suspicion = state.shapeshifterMayorSuspicion[listener.id] ?? {};
      suspicion[claimant.id] = (suspicion[claimant.id] ?? 0) + 2.5;
      suspicion[claimedMayor.id] = (suspicion[claimedMayor.id] ?? 0) + 0.35;
      state.shapeshifterMayorSuspicion[listener.id] = suspicion;
    }
  }

  private deductionTagsForDialogue(first: Agent, second: Agent, topic: string, lines: string[]): string[] {
    const joined = `${topic} ${lines.join(' ')}`.toLowerCase();
    const tags = ['npc-dialogue'];
    if (first.deductionRole === 'shapeshifter' || second.deductionRole === 'shapeshifter') {
      tags.push('repeatedMayorProbe');
    }
    if (this.roleMayNeedMayor(first) || this.roleMayNeedMayor(second)) {
      tags.push('roleGroundedMayorQuestion');
    }
    if (/official schedule|usually knows the official schedule|mayor business/i.test(joined)) {
      tags.push('mayorMisdirection');
    }
    if (/where the mayor stays|after dark|route|alone|private/i.test(joined)) {
      tags.push('privateMayorProbe');
    }
    return [...new Set(tags)];
  }

  private recordDeductionDialogue(
    speaker: Agent,
    listener: Agent,
    location: TownLocation,
    topic: string,
    lines: string[],
    tags: string[],
  ): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    const record: DeductionDialogueRecord = {
      id: `deduction-dialogue-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      day: state.day,
      timeLabel: this.timeLabel,
      locationName: location.name,
      speakerId: speaker.id,
      listenerId: listener.id,
      speakerName: speaker.name,
      listenerName: listener.name,
      lines,
      topic,
      tags,
    };
    state.dialogueHistory.unshift(record);
    state.dialogueHistory = state.dialogueHistory.slice(0, 160);
    this.createEvidenceFromDialogue(record);
  }

  private recordDeductionPlayerDialogue(
    agent: Agent,
    playerLine: string,
    npcLine: string,
    playerMessage: string,
    result: LLMPlayerDialogueResult,
  ): void {
    const state = this.deduction;
    if (!state) {
      return;
    }

    const joined = `${playerMessage} ${result.npcIntent} ${npcLine}`.toLowerCase();
    const tags = ['player-dialogue'];
    if (/mayor|leader|镇长|鎮長|市长/.test(joined)) {
      tags.push(this.roleMayNeedMayor(agent) ? 'roleGroundedMayorQuestion' : 'mayorQuestion');
    }
    if (/route|where.*stay|where.*live|after dusk|住哪|行程|路线/.test(joined)) {
      tags.push('privateMayorProbe');
    }
    if (/misdirect|handles mayor business|official schedule|after dusk/.test(joined)) {
      tags.push('mayorMisdirection');
    }
    if (state.playerSide === 'shapeshifter') {
      tags.push('playerShapeshifterQuestion');
      if (agent.deductionRole !== 'mayor' && /mayor|leader|镇长|鎮長|市长/.test(joined)) {
        state.playerSuspicion = Math.min(DEDUCTION_PLAYER_SUSPICION_LIMIT, state.playerSuspicion + 4);
      }
    }

    const record: DeductionDialogueRecord = {
      id: `deduction-dialogue-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      day: state.day,
      timeLabel: this.timeLabel,
      locationName: this.agentLocation(agent).name,
      speakerId: 'player',
      listenerId: agent.id,
      speakerName: this.player.profile.name,
      listenerName: agent.name,
      lines: [`${this.player.profile.name}: ${playerLine}`, npcLine],
      topic: result.npcIntent || 'Player questioned an NPC',
      tags: [...new Set(tags)],
    };
    state.dialogueHistory.unshift(record);
    state.dialogueHistory = state.dialogueHistory.slice(0, 160);
    this.createEvidenceFromDialogue(record);
  }

  private roleMayNeedMayor(agent: Agent): boolean {
    return /doctor|teacher|reporter|farmer|harbor|postal|mechanic|librarian/i.test(agent.role);
  }

  private mayorNeedForRole(agent: Agent): string {
    const role = agent.role.toLowerCase();
    if (role.includes('doctor')) return 'you may need the mayor to approve emergency clinic supplies or a public health notice.';
    if (role.includes('teacher')) return 'you may need the mayor to approve a school safety decision.';
    if (role.includes('reporter')) return 'you may need an official statement from the mayor.';
    if (role.includes('farmer')) return 'you may need help reporting crop damage or farm gate repairs.';
    if (role.includes('harbor')) return 'you may need the mayor to resolve dock safety or missing cargo.';
    if (role.includes('postal')) return 'you may need the mayor to verify an urgent public notice.';
    if (role.includes('mechanic')) return 'you may need the mayor to approve town repair priorities.';
    if (role.includes('librarian')) return 'you may need the mayor to authorize access to archived town records.';
    return 'you may need the mayor only if there is a concrete town problem tied to your role.';
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
