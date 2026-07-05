import type { LocationId } from '../data/locations';
import type { AgentEmoteKind } from './types';

export type ActionSource = 'llm' | 'fallback' | 'rule';
export type ActionPromptType = 'plan' | 'dialogue' | 'player-dialogue' | 'deception' | 'director' | 'rule';
export type TaskContractKind =
  | 'talkToAgent'
  | 'deliverItem'
  | 'gatherItem'
  | 'inspectLocation'
  | 'buyOrSellItem'
  | 'verifyRumor';

export type ActionContract =
  | {
      type: 'goToLocation';
      targetLocationId: LocationId;
      reason: string;
      goal?: string;
      action?: string;
    }
  | {
      type: 'followPlayer';
      reason: string;
      targetLocationId?: LocationId;
    }
  | {
      type: 'inspectLocation';
      targetLocationId: LocationId;
      reason: string;
      claim?: string;
      urgency?: 'low' | 'normal' | 'high';
    }
  | {
      type: 'returnHome';
      reason: string;
    }
  | {
      type: 'askPlayerForItem';
      itemId: string;
      reason: string;
      quantity?: number;
      rewardGold?: number;
    }
  | {
      type: 'offerTrade';
      reason: string;
    }
  | {
      type: 'tellRumor';
      claim: string;
      reason: string;
      targetAgentId?: string;
    }
  | {
      type: 'shareBelief';
      summary: string;
      reason: string;
      beliefId?: string;
      targetAgentId?: string;
    }
  | {
      type: 'showEmote';
      emote: AgentEmoteKind;
      reason: string;
    }
  | {
      type: 'adjustRelationship';
      reason: string;
      familiarity?: number;
      trust?: number;
      affinity?: number;
    }
  | {
      type: 'waitAtPost';
      reason: string;
    }
  | {
      type: 'createTask';
      title: string;
      description: string;
      reason: string;
      contractKind: TaskContractKind;
      targetLocationId?: LocationId;
      targetAgentId?: string;
      requiredItemId?: string;
      targetBeliefId?: string;
      rewardGold?: number;
      rewardReputation?: number;
    }
  | {
      type: 'reportIncident';
      reason: string;
      incidentId?: string;
      title?: string;
      summary?: string;
      targetLocationId?: LocationId;
    }
  | {
      type: 'verifyRumor';
      reason: string;
      targetBeliefId?: string;
      targetLocationId?: LocationId;
    }
  | {
      type: 'requestHelp';
      reason: string;
      targetAgentId?: string;
      targetLocationId?: LocationId;
    }
  | {
      type: 'rejectAction';
      reason: string;
    };

export interface ActionValidationResult {
  valid: boolean;
  action: ActionContract;
  reason: string;
}

export interface ActionExecutionResult {
  accepted: boolean;
  action: ActionContract;
  source: ActionSource;
  reason: string;
  createdMemoryId?: string;
  createdBeliefId?: string;
}

export interface ActionTrace {
  id: string;
  timeLabel: string;
  promptType: ActionPromptType;
  source: ActionSource;
  rawSummary: string;
  accepted: ActionExecutionResult[];
  rejected: ActionExecutionResult[];
  evidenceMemoryIds: string[];
  beliefIds: string[];
  relationshipDelta?: {
    familiarity?: number;
    trust?: number;
    affinity?: number;
  };
}
