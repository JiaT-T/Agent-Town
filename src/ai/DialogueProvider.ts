import type { Agent, WorldEvent } from '../agents/types';
import type { TownLocation } from '../data/locations';

export interface DialogueLine {
  agentId: string;
  text: string;
}

export interface DialogueRequest {
  speaker: Agent;
  listener: Agent;
  location: TownLocation;
  timeLabel: string;
  recentEvents: WorldEvent[];
}

export interface DialogueResult {
  topic: string;
  lines: DialogueLine[];
}

export interface DialogueProvider {
  generateDialogue(request: DialogueRequest): DialogueResult;
}
