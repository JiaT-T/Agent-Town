import type { LocationId, Vector2 } from '../data/locations';
import type { PlayerAppearance } from '../appearance/types';

export type PlayerGender = 'female' | 'male' | 'nonBinary' | 'custom';
export type PlayerRole = 'Visitor' | 'Student' | 'Journalist' | 'Researcher' | 'Local Resident';
export type PlayerFacing = 'down' | 'up' | 'left' | 'right';
export type PlayerAnimationState = `idle-${PlayerFacing}` | `walk-${PlayerFacing}`;
export type PlayerDialogueOptionId = 'ask-plan' | 'tell-event' | 'invite-event' | 'ask-memory';

export interface PlayerProfile {
  name: string;
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
  quest: PlayerQuestState;
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
  gender?: PlayerGender;
  role?: PlayerRole;
  personalityTags?: string[];
  objective?: string;
  spawnLocation?: LocationId;
  appearance?: PlayerAppearance;
  stats?: Partial<PlayerStats>;
}

export const PLAYER_DIALOGUE_OPTIONS: PlayerDialogueOption[] = [
  { id: 'ask-plan', label: 'Ask current plan' },
  { id: 'tell-event', label: 'Tell event' },
  { id: 'invite-event', label: 'Invite to gathering' },
  { id: 'ask-memory', label: 'Ask memory' },
];
