import { memoryStore } from './MemoryStore';
import type { Agent, MemoryEntry, MemoryType } from './types';

// Memory is intentionally compact: short, timestamped observations are enough
// for the MVP and can later be sent as context to an LLM dialogue planner.
export function remember(
  agent: Agent,
  summary: string,
  timeMinutes: number,
  type: MemoryType = 'observation',
  importance = 1,
  tags: string[] = [],
  relatedAgentIds: string[] = [],
): MemoryEntry {
  return memoryStore.write(agent, {
    summary,
    timeMinutes,
    type,
    importance,
    tags,
    relatedAgentIds,
  });
}

export function recentMemoryText(agent: Agent, count = 3): string {
  return memoryStore
    .retrieve(agent, { limit: count })
    .map((result) => result.memory.summary)
    .join(' ');
}
