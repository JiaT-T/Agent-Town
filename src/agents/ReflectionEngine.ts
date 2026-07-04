import type { Agent, MemoryEntry } from './types';
import { memoryStore } from './MemoryStore';

export interface Reflection {
  id: string;
  agentId: string;
  timeMinutes: number;
  summary: string;
  sourceMemoryIds: string[];
  focalQuestions: string[];
  insights: string[];
}

export interface ReflectionOptions {
  minImportance?: number;
  limit?: number;
}

export class ReflectionEngine {
  generate(agent: Agent, timeMinutes: number, options: ReflectionOptions = {}): Reflection | undefined {
    const memories = memoryStore
      .retrieve(agent, {
        minImportance: options.minImportance ?? 4,
        nowMinutes: timeMinutes,
        limit: options.limit ?? 5,
      })
      .map((result) => result.memory);

    if (memories.length < 1) {
      return undefined;
    }

    const focalQuestions = this.generateFocalQuestions(agent, memories);
    const insights = this.generateInsights(agent, memories, focalQuestions);

    return {
      id: `reflection-${agent.id}-${timeMinutes}`,
      agentId: agent.id,
      timeMinutes,
      summary: insights[0] ?? this.summarize(agent, memories),
      sourceMemoryIds: memories.map((memory) => memory.id),
      focalQuestions,
      insights,
    };
  }

  private generateFocalQuestions(agent: Agent, memories: MemoryEntry[]): string[] {
    const agents = new Set(
      memories
        .flatMap((memory) => memory.relatedAgentIds)
        .filter((id) => id !== agent.id),
    );
    const eventMemory = memories.find((memory) => memory.type === 'event');
    const conversationMemory = memories.find((memory) => memory.type === 'conversation');

    return [
      `What should ${agent.name} remember from these recent experiences?`,
      eventMemory
        ? `Does ${eventMemory.summary} change ${agent.name}'s plan today?`
        : `Which current plan is most affected by these memories?`,
      conversationMemory || agents.size > 0
        ? `How should these social interactions affect ${agent.name}'s relationships?`
        : `What should ${agent.name} infer about the town from this pattern?`,
    ];
  }

  private generateInsights(agent: Agent, memories: MemoryEntry[], focalQuestions: string[]): string[] {
    const strongest = memories[0];
    const eventCount = memories.filter((memory) => memory.type === 'event').length;
    const conversationCount = memories.filter((memory) => memory.type === 'conversation').length;
    const planCount = memories.filter((memory) => memory.type === 'plan').length;
    const evidence = strongest ? ` Evidence: "${strongest.summary}"` : '';

    const insights = [
      `${agent.name} should use recent high-importance memories when choosing the next plan.${evidence}`,
    ];

    if (eventCount > 0) {
      insights.push(`${agent.name} sees a town event as a possible driver for schedule changes.`);
    }
    if (conversationCount > 0) {
      insights.push(`${agent.name} is learning socially and should let conversations affect future choices.`);
    }
    if (planCount > 0) {
      insights.push(`${agent.name}'s plan history should stay consistent unless new evidence is stronger.`);
    }

    return insights.slice(0, Math.max(1, focalQuestions.length));
  }

  private summarize(agent: Agent, memories: MemoryEntry[]): string {
    const eventCount = memories.filter((memory) => memory.type === 'event').length;
    const conversationCount = memories.filter((memory) => memory.type === 'conversation').length;
    const strongest = memories[0];

    if (eventCount > 0 && conversationCount > 0) {
      return `${agent.name} is connecting recent events with conversations and may seek more social information.`;
    }

    return `${agent.name} is influenced by "${strongest.summary}" and should consider it during planning.`;
  }
}
