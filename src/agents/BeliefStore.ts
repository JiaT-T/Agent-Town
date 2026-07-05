import type { Agent, MemoryEntry } from './types';

export type BeliefType = 'fact' | 'rumor' | 'suspicion' | 'lie';
export type BeliefStance = 'believes' | 'doubts' | 'denies' | 'unknown';

export interface AgentBelief {
  id: string;
  type: BeliefType;
  summary: string;
  sourceAgentId?: string;
  targetAgentIds: string[];
  confidence: number;
  stance: BeliefStance;
  evidenceMemoryIds: string[];
  isPublic: boolean;
  tags: string[];
  createdAtMinutes: number;
  lastUpdatedAtMinutes: number;
}

export interface BeliefInput {
  type: BeliefType;
  summary: string;
  sourceAgentId?: string;
  targetAgentIds?: string[];
  confidence?: number;
  stance?: BeliefStance;
  evidenceMemoryIds?: string[];
  isPublic?: boolean;
  tags?: string[];
  timeMinutes: number;
}

export interface BeliefQuery {
  limit?: number;
  types?: BeliefType[];
  tags?: string[];
  targetAgentId?: string;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function beliefId(): string {
  return `belief-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function normalizeSummary(summary: string): string {
  return summary.trim().replace(/\s+/g, ' ');
}

class BeliefStore {
  write(agent: Agent, input: BeliefInput): AgentBelief {
    const summary = normalizeSummary(input.summary);
    const existing = agent.beliefs.find(
      (belief) =>
        belief.type === input.type &&
        belief.summary.toLowerCase() === summary.toLowerCase() &&
        belief.sourceAgentId === input.sourceAgentId,
    );

    if (existing) {
      existing.confidence = clampConfidence(Math.max(existing.confidence, input.confidence ?? existing.confidence));
      existing.stance = input.stance ?? existing.stance;
      existing.targetAgentIds = [...new Set([...existing.targetAgentIds, ...(input.targetAgentIds ?? [])])];
      existing.evidenceMemoryIds = [...new Set([...existing.evidenceMemoryIds, ...(input.evidenceMemoryIds ?? [])])];
      existing.tags = [...new Set([...existing.tags, ...(input.tags ?? [])])];
      existing.isPublic = existing.isPublic || Boolean(input.isPublic);
      existing.lastUpdatedAtMinutes = input.timeMinutes;
      return existing;
    }

    const belief: AgentBelief = {
      id: beliefId(),
      type: input.type,
      summary,
      sourceAgentId: input.sourceAgentId,
      targetAgentIds: [...new Set(input.targetAgentIds ?? [])],
      confidence: clampConfidence(input.confidence ?? 0.5),
      stance: input.stance ?? 'unknown',
      evidenceMemoryIds: [...new Set(input.evidenceMemoryIds ?? [])],
      isPublic: input.isPublic ?? false,
      tags: [...new Set(input.tags ?? [])],
      createdAtMinutes: input.timeMinutes,
      lastUpdatedAtMinutes: input.timeMinutes,
    };
    agent.beliefs.unshift(belief);
    agent.beliefs = agent.beliefs.slice(0, 80);
    return belief;
  }

  writeFromMemory(
    agent: Agent,
    memory: MemoryEntry,
    input: Omit<BeliefInput, 'summary' | 'timeMinutes'> & { summary?: string },
  ): AgentBelief {
    return this.write(agent, {
      ...input,
      summary: input.summary ?? memory.summary,
      evidenceMemoryIds: [...(input.evidenceMemoryIds ?? []), memory.id],
      timeMinutes: memory.timeMinutes,
    });
  }

  top(agent: Agent, query: BeliefQuery = {}): AgentBelief[] {
    const limit = query.limit ?? 5;
    return agent.beliefs
      .filter((belief) => !query.types || query.types.includes(belief.type))
      .filter((belief) => !query.targetAgentId || belief.targetAgentIds.includes(query.targetAgentId))
      .filter((belief) => !query.tags || query.tags.some((tag) => belief.tags.includes(tag)))
      .sort((a, b) => {
        const aScore = a.confidence * 10 + a.lastUpdatedAtMinutes / 1000;
        const bScore = b.confidence * 10 + b.lastUpdatedAtMinutes / 1000;
        return bScore - aScore;
      })
      .slice(0, limit);
  }
}

export const beliefStore = new BeliefStore();
