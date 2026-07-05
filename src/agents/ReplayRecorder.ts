import type { Agent, MemoryEntry, WorldEvent } from './types';

export type ReplayRecordType = 'plan' | 'dialogue' | 'reflection' | 'event' | 'action' | 'belief' | 'relationship' | 'task' | 'director';

export interface ReplayRecord {
  id: string;
  type: ReplayRecordType;
  timeMinutes: number;
  agentIds: string[];
  summary: string;
  payload: unknown;
}

const MAX_REPLAY_RECORDS = 300;

export class ReplayRecorder {
  private sequence = 0;
  private readonly records: ReplayRecord[] = [];

  recordPlan(agent: Agent, timeMinutes: number): void {
    this.push('plan', timeMinutes, [agent.id], `${agent.name}: ${agent.currentGoal}`, {
      destination: agent.destination,
      action: agent.currentAction,
      goal: agent.currentGoal,
      reason: agent.reason,
      retrievedMemoryIds: agent.retrievedMemories.map((memory) => memory.id),
      reflection: agent.reflection,
    });
  }

  recordDialogue(agentIds: string[], timeMinutes: number, summary: string, turns: unknown): void {
    this.push('dialogue', timeMinutes, agentIds, summary, { turns });
  }

  recordReflection(agent: Agent, timeMinutes: number, reflection: string, memories: MemoryEntry[]): void {
    this.push('reflection', timeMinutes, [agent.id], `${agent.name}: ${reflection}`, {
      reflection,
      evidenceMemoryIds: memories.map((memory) => memory.id),
    });
  }

  recordEvent(event: WorldEvent): void {
    this.push('event', event.createdAtMinutes, event.interestedAgentIds, event.description, event);
  }

  recordAction(agentIds: string[], timeMinutes: number, summary: string, payload: unknown): void {
    this.push('action', timeMinutes, agentIds, summary, payload);
  }

  recordBelief(agentIds: string[], timeMinutes: number, summary: string, payload: unknown): void {
    this.push('belief', timeMinutes, agentIds, summary, payload);
  }

  recordRelationship(agentIds: string[], timeMinutes: number, summary: string, payload: unknown): void {
    this.push('relationship', timeMinutes, agentIds, summary, payload);
  }

  recordTask(agentIds: string[], timeMinutes: number, summary: string, payload: unknown): void {
    this.push('task', timeMinutes, agentIds, summary, payload);
  }

  recordDirector(timeMinutes: number, summary: string, payload: unknown): void {
    const agentIds =
      typeof payload === 'object' && payload !== null && Array.isArray((payload as { relatedAgentIds?: unknown[] }).relatedAgentIds)
        ? (payload as { relatedAgentIds: unknown[] }).relatedAgentIds.filter((id): id is string => typeof id === 'string')
        : [];
    this.push('director', timeMinutes, agentIds, summary, payload);
  }

  export(): ReplayRecord[] {
    return this.records.map((record) => ({
      ...record,
      agentIds: [...record.agentIds],
    }));
  }

  clear(): void {
    this.records.length = 0;
    this.sequence = 0;
  }

  private push(type: ReplayRecordType, timeMinutes: number, agentIds: string[], summary: string, payload: unknown): void {
    this.records.unshift({
      id: `replay-${this.sequence++}`,
      type,
      timeMinutes: Math.floor(timeMinutes),
      agentIds,
      summary,
      payload,
    });
    if (this.records.length > MAX_REPLAY_RECORDS) {
      this.records.length = MAX_REPLAY_RECORDS;
    }
  }
}
