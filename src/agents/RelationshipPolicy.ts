import type { ActionContract } from './ActionContract';
import type { Agent } from './types';

export interface RelationshipDecision {
  allowed: boolean;
  reason: string;
  confidenceMultiplier: number;
}

function relation(agent: Agent) {
  return agent.relationships.player ?? { familiarity: 0, trust: 0, affinity: 0 };
}

export class RelationshipPolicy {
  evaluate(agent: Agent, action: ActionContract): RelationshipDecision {
    const current = relation(agent);

    if (action.type === 'followPlayer' && current.trust < 18) {
      return {
        allowed: false,
        reason: `trust ${current.trust} is too low for following the player.`,
        confidenceMultiplier: 0.55,
      };
    }

    if (action.type === 'inspectLocation') {
      const urgent = action.urgency === 'high';
      if (!urgent && current.trust < 10) {
        return {
          allowed: false,
          reason: `trust ${current.trust} is too low for a non-urgent inspection.`,
          confidenceMultiplier: 0.6,
        };
      }

      return {
        allowed: true,
        reason: urgent ? 'urgent report overrides moderate trust checks.' : 'relationship allows inspection.',
        confidenceMultiplier: current.trust >= 50 ? 1.15 : current.trust < 20 ? 0.72 : 1,
      };
    }

    if (action.type === 'shareBelief' || action.type === 'tellRumor') {
      return {
        allowed: true,
        reason: 'rumor can be stored as non-factual belief.',
        confidenceMultiplier: current.trust >= 50 ? 1.1 : current.trust < 20 ? 0.75 : 1,
      };
    }

    if (action.type === 'offerTrade') {
      return {
        allowed: agent.tradeProfile?.enabled ?? false,
        reason: agent.tradeProfile?.enabled ? 'trade profile is enabled.' : 'agent does not trade.',
        confidenceMultiplier: 1,
      };
    }

    return {
      allowed: true,
      reason: 'relationship policy has no objection.',
      confidenceMultiplier: current.trust >= 60 ? 1.08 : 1,
    };
  }

  confidence(agent: Agent, baseConfidence: number): number {
    const current = relation(agent);
    const trustBias = current.trust >= 60 ? 0.12 : current.trust < 20 ? -0.18 : 0;
    return Math.max(0.05, Math.min(0.95, baseConfidence + trustBias));
  }
}
