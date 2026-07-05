import type { LocationId, Vector2 } from '../data/locations';
import type { CharacterAppearance } from '../appearance/types';
import type { GridPoint } from './Pathfinding';
import type { TradeProfile } from '../trade/types';
import type { ActionExecutionResult, ActionTrace } from './ActionContract';
import type { AgentBelief } from './BeliefStore';

export type Mood = 'focused' | 'curious' | 'cheerful' | 'tired' | 'hungry' | 'social';
export type MemoryType = 'observation' | 'conversation' | 'event' | 'plan' | 'reflection';
export type WorldEventSource = 'player' | 'system';
export type LLMMode = 'Connected' | 'Fallback' | 'Error';
export type AgentFacing = 'down' | 'up' | 'left' | 'right';
export type AgentAnimationState = `idle-${AgentFacing}` | `walk-${AgentFacing}`;
export type AgentPosture = 'standing' | 'walking';
export type AgentHeldItemKind =
  | 'book'
  | 'coffee'
  | 'hoe'
  | 'spatula'
  | 'pan'
  | 'medicalBag'
  | 'wrench'
  | 'paintKit'
  | 'produce'
  | 'key'
  | 'letter'
  | 'rope'
  | 'fish'
  | 'notebook'
  | 'map';
export type AgentMobility = 'roaming' | 'buildingBound' | 'counterBound';
export type AgentEmoteKind = 'heart' | 'message' | 'question' | 'angry' | 'sad' | 'surprise' | 'neutral';
export type AgentDeductionRole = 'townsfolk' | 'mayor' | 'shapeshifter';

export interface AgentNeeds {
  energy: number;
  social: number;
  hunger: number;
}

export interface ScheduleEntry {
  start: string;
  locationId: LocationId;
  action: string;
  goal: string;
}

export interface DailyPlanEntry {
  startMinutes: number;
  durationMinutes: number;
  locationId: LocationId;
  action: string;
  goal: string;
}

export interface TaskDecompositionEntry {
  action: string;
  durationMinutes: number;
}

export interface MemoryEntry {
  id: string;
  time: string;
  timeMinutes: number;
  lastAccessedMinutes: number;
  type: MemoryType;
  summary: string;
  importance: number;
  poignancy: number;
  tags: string[];
  relatedAgentIds: string[];
  evidenceMemoryIds: string[];
  embeddingText: string;
  accessCount: number;
}

export interface SpeechBubble {
  text: string;
  expiresAtMs: number;
}

export interface SpeechQueueLine {
  text: string;
  expiresAtMs: number;
}

export interface AgentEmoteState {
  kind: AgentEmoteKind;
  source: 'llm' | 'fallback' | 'system';
  expiresAtMs?: number;
  message?: string;
}

export interface AgentPendingMessage {
  text: string;
  source: 'llm' | 'system';
  createdAtMinutes: number;
  requestId?: string;
}

export type AgentTemporaryDirective =
  | {
      kind: 'followPlayer';
      reason: string;
      startedAtMinutes: number;
      untilMinutes: number;
      targetLocationId?: LocationId;
      lastTargetCellKey?: string;
    }
  | {
      kind: 'inspectLocation';
      reason: string;
      startedAtMinutes: number;
      untilMinutes: number;
      targetLocationId: LocationId;
      returnLocationId?: LocationId;
      claim?: string;
      inspectionDone?: boolean;
    }
  | {
      kind: 'returnHomeLocation';
      reason: string;
      startedAtMinutes: number;
      untilMinutes: number;
      targetLocationId: LocationId;
    };

export interface Agent {
  id: string;
  name: string;
  role: string;
  personality: string;
  mobility: AgentMobility;
  homeLocationId?: LocationId;
  counterAnchor?: Vector2;
  appearance: CharacterAppearance;
  tradeProfile?: TradeProfile;
  position: Vector2;
  destination: LocationId;
  currentAction: string;
  currentGoal: string;
  plannedAction: string;
  reason: string;
  lastObservation: string;
  lastPlan: string;
  lastAction: string;
  lastMemory: string;
  nextPlan: string;
  mood: Mood;
  needs: AgentNeeds;
  schedule: ScheduleEntry[];
  dailyPlan: DailyPlanEntry[];
  currentTaskDecomposition: TaskDecompositionEntry[];
  memories: MemoryEntry[];
  retrievedMemories: MemoryEntry[];
  reflection: string;
  relationships: Record<string, { familiarity: number; trust: number; affinity: number }>;
  beliefs: AgentBelief[];
  acceptedActions: ActionExecutionResult[];
  rejectedActions: ActionExecutionResult[];
  lastActionTrace?: ActionTrace;
  currentPath: GridPoint[];
  pathIndex: number;
  pathStatus: string;
  lastLLMDecision: string;
  facing: AgentFacing;
  isMoving: boolean;
  animationState: AgentAnimationState;
  posture: AgentPosture;
  heldItem?: AgentHeldItemKind;
  conversationCooldown: number;
  color: number;
  speed: number;
  nextDecisionIn: number;
  interestedEventIds: string[];
  playerDirective?: AgentTemporaryDirective;
  emoteState?: AgentEmoteState;
  pendingMessage?: AgentPendingMessage;
  relationshipDeltaReason?: string;
  deductionRole?: AgentDeductionRole;
  isAlive?: boolean;
  lastActionMemoryKey?: string;
  speechBubble?: SpeechBubble;
  speechQueue?: SpeechQueueLine[];
  conversationLockUntilMs?: number;
}

export interface LLMRuntimeStatus {
  mode: LLMMode;
  lastCall: string;
  lastLatencyMs: number;
  lastPromptType: 'none' | 'plan' | 'dialogue' | 'reflection' | 'director' | 'test';
  lastResultSummary: string;
  lastFailureReason: string;
  callCounts: {
    plan: number;
    dialogue: number;
    reflection: number;
    director: number;
  };
  fallbackCount: number;
  lastError?: string;
}

export interface WorldEvent {
  id: string;
  title: string;
  description: string;
  timeMinutes: number;
  locationId: LocationId;
  createdAtMinutes: number;
  interestedAgentIds: string[];
  source: WorldEventSource;
  groupInteractionDone?: boolean;
}

export interface LogEntry {
  id: string;
  time: string;
  message: string;
}

export interface Observation {
  timeMinutes: number;
  timeLabel: string;
  nearbyAgents: Agent[];
  activeEvents: WorldEvent[];
  allEvents: WorldEvent[];
}

export interface PlanResult {
  destination: LocationId;
  action: string;
  goal: string;
  reason: string;
  planSummary: string;
  mood: Mood;
}
