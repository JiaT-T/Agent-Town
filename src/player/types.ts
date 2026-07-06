import type { LocationId, Vector2 } from '../data/locations';
import type { PlayerAppearance } from '../appearance/types';

export type PlayerGender = 'female' | 'male' | 'nonBinary' | 'custom';
export type PlayerRole = 'Visitor' | 'Student' | 'Journalist' | 'Researcher' | 'Local Resident';
export type PlayerFacing = 'down' | 'up' | 'left' | 'right';
export type PlayerAnimationState = `idle-${PlayerFacing}` | `walk-${PlayerFacing}`;
export type PlayerDialogueOptionId =
  | 'ask-plan'
  | 'tell-event'
  | 'invite-event'
  | 'ask-memory'
  | 'ask-request'
  | 'accept-request'
  | 'decline-request';
export type GameMode = 'life' | 'deduction' | 'shapeshifter';
export type LanguageCode = 'en' | 'zh';

export interface DeductionConfigInput {
  npcCount: number;
  shapeshifterCount: number;
}

export interface PlayerProfile {
  name: string;
  language: LanguageCode;
  gender: PlayerGender;
  role: PlayerRole;
  personalityTags: string[];
  objective: string;
  spawnLocation: LocationId;
  appearance: PlayerAppearance;
}

export interface PlayerStats {
  energy: number;
  social: number;
  hunger: number;
  reputation: number;
  curiosity: number;
}

export interface PlayerQuestState {
  id: 'organize-evening-gathering';
  title: string;
  talkedNpcIds: string[];
  invitedNpcIds: string[];
  completed: boolean;
  completionMessage?: string;
}

export type PlayerRequestStatus = 'active' | 'readyToClaim' | 'completed';
export type PlayerRequestKind =
  | 'visitLocation'
  | 'gatherItem'
  | 'talkToRole'
  | 'talkToAgent'
  | 'deliverItem'
  | 'inspectLocation'
  | 'buyOrSellItem'
  | 'verifyRumor';

export interface PlayerRequestState {
  id: string;
  title: string;
  description: string;
  kind: PlayerRequestKind;
  status: PlayerRequestStatus;
  giverAgentId: string;
  giverName: string;
  targetLocationId?: LocationId;
  verificationLocationId?: LocationId;
  targetAgentId?: string;
  targetItemId?: string;
  requiredItemId?: string;
  targetBeliefId?: string;
  sourceIncidentId?: string;
  contractKind?: PlayerRequestKind;
  targetRoleKeyword?: string;
  progress: number;
  required: number;
  rewardGold: number;
  rewardReputation: number;
  actionLabel?: string;
}

export interface PlayerInventoryItem {
  id: string;
  name: string;
  quantity: number;
  category: 'food' | 'material' | 'quest' | 'service' | 'item' | 'information' | 'crop';
  iconKey?: string;
  sellPrice?: number;
  source?: 'harvest' | 'trade' | 'quest' | 'system';
}

export type PlayerInteractionKind = 'none' | 'npc' | 'event' | 'building' | 'object';

export interface PlayerInteractionHint {
  kind: PlayerInteractionKind;
  label: string;
  targetId?: string;
  locationId?: LocationId;
}

export interface PlayerDialogueOption {
  id: PlayerDialogueOptionId;
  label: string;
}

export interface PlayerDialogueTurn {
  speaker: 'player' | 'npc';
  text: string;
  timeLabel: string;
}

export interface PlayerDialogueState {
  npcId: string;
  npcLine: string;
  playerIntent: string;
  npcIntent: string;
  options: PlayerDialogueOption[];
  awaitingLLM: boolean;
  turns: PlayerDialogueTurn[];
}

export interface PlayerState {
  id: 'player';
  profile: PlayerProfile;
  position: Vector2;
  facing: PlayerFacing;
  isMoving: boolean;
  animationState: PlayerAnimationState;
  stats: PlayerStats;
  gold: number;
  inventory: PlayerInventoryItem[];
  quest: PlayerQuestState;
  requests: PlayerRequestState[];
  interactionHint: PlayerInteractionHint;
  dialogue?: PlayerDialogueState;
}

export interface PlayerMovementInput {
  x: number;
  y: number;
  running: boolean;
}

export interface PlayerProfileInput {
  name?: string;
  language?: LanguageCode;
  gender?: PlayerGender;
  role?: PlayerRole;
  personalityTags?: string[];
  objective?: string;
  spawnLocation?: LocationId;
  appearance?: PlayerAppearance;
  stats?: Partial<PlayerStats>;
  gameMode?: GameMode;
  deductionConfig?: DeductionConfigInput;
}

export const PLAYER_DIALOGUE_OPTIONS: PlayerDialogueOption[] = [
  { id: 'ask-plan', label: 'Ask current plan' },
  { id: 'ask-request', label: 'Ask request' },
  { id: 'tell-event', label: 'Tell event' },
  { id: 'invite-event', label: 'Invite to gathering' },
  { id: 'ask-memory', label: 'Ask memory' },
];

export const PLAYER_REQUEST_RESPONSE_OPTIONS: PlayerDialogueOption[] = [
  { id: 'accept-request', label: 'Accept request' },
  { id: 'decline-request', label: 'Decline' },
];
