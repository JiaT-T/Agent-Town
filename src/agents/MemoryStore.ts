import type { Agent, MemoryEntry, MemoryType } from './types';
import { formatTime } from './time';

export interface MemoryWriteInput {
  summary: string;
  timeMinutes: number;
  type?: MemoryType;
  importance?: number;
  tags?: string[];
  relatedAgentIds?: string[];
  evidenceMemoryIds?: string[];
  embeddingText?: string;
}

export interface MemoryQuery {
  text?: string;
  types?: MemoryType[];
  tags?: string[];
  minImportance?: number;
  nowMinutes?: number;
  limit?: number;
}

export interface RetrievedMemory {
  memory: MemoryEntry;
  score: number;
  recencyScore: number;
  importanceScore: number;
  relevanceScore: number;
  decayedImportance: number;
}

const DEFAULT_LIMIT = 120;
const DECAY_HALF_LIFE_MINUTES = 360;
const RECENCY_DECAY_HOURS = 0.995;
const RETRIEVAL_WEIGHTS = {
  recency: 0.5,
  relevance: 3,
  importance: 2,
};

function clampImportance(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function minutesSince(nowMinutes: number, memoryMinutes: number): number {
  return Math.max(0, nowMinutes - memoryMinutes);
}

function relevanceScore(memory: MemoryEntry, normalizedText?: string): number {
  if (!normalizedText) {
    return 0;
  }

  const words = normalizedText
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length > 3);

  if (words.length === 0) {
    return 0;
  }

  const haystack = `${memory.summary} ${memory.embeddingText ?? ''} ${memory.tags.join(' ')}`.toLowerCase();
  const matches = words.filter((word) => haystack.includes(word)).length;
  return Math.min(1.5, matches * 0.35);
}

function normalizeScores<T extends { raw: number }>(items: T[]): number[] {
  if (items.length === 0) {
    return [];
  }

  const values = items.map((item) => item.raw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) {
    return items.map(() => 0.5);
  }

  return values.map((value) => (value - min) / (max - min));
}

export class MemoryStore {
  private sequence = 0;

  constructor(private readonly maxEntries = DEFAULT_LIMIT) {}

  getStream(agent: Agent): MemoryEntry[] {
    return agent.memories;
  }

  write(agent: Agent, input: MemoryWriteInput): MemoryEntry {
    const memory: MemoryEntry = {
      id: `mem-${agent.id}-${this.sequence++}`,
      time: formatTime(input.timeMinutes),
      timeMinutes: input.timeMinutes,
      lastAccessedMinutes: input.timeMinutes,
      type: input.type ?? 'observation',
      summary: input.summary,
      importance: clampImportance(input.importance ?? 1),
      poignancy: clampImportance(input.importance ?? 1),
      tags: input.tags ?? [],
      relatedAgentIds: input.relatedAgentIds ?? [],
      evidenceMemoryIds: input.evidenceMemoryIds ?? [],
      embeddingText: input.embeddingText ?? input.summary,
      accessCount: 0,
    };

    agent.memories.unshift(memory);
    agent.memories = agent.memories.slice(0, this.maxEntries);
    agent.lastMemory = `[${memory.type}][${memory.importance}] ${memory.summary}`;
    return memory;
  }

  retrieve(agent: Agent, query: MemoryQuery = {}): RetrievedMemory[] {
    const nowMinutes = query.nowMinutes ?? agent.memories[0]?.timeMinutes ?? 0;
    const normalizedText = query.text?.toLowerCase();

    const candidates = agent.memories
      .filter((memory) => {
        if (query.types && !query.types.includes(memory.type)) return false;
        if (query.minImportance && memory.importance < query.minImportance) return false;
        if (query.tags && !query.tags.some((tag) => memory.tags.includes(tag))) return false;
        return true;
      })
      .map((memory) => {
        const lastAccessed = memory.lastAccessedMinutes ?? memory.timeMinutes;
        const hoursSinceAccess = minutesSince(nowMinutes, lastAccessed) / 60;
        return {
          memory,
          recencyRaw: Math.pow(RECENCY_DECAY_HOURS, hoursSinceAccess),
          importanceRaw: memory.poignancy ?? memory.importance,
          relevanceRaw: relevanceScore(memory, normalizedText),
          decayedImportance: this.decayedImportance(memory, nowMinutes),
        };
      });

    const recencyScores = normalizeScores(candidates.map((candidate) => ({ raw: candidate.recencyRaw })));
    const importanceScores = normalizeScores(candidates.map((candidate) => ({ raw: candidate.importanceRaw })));
    const relevanceScores = normalizeScores(candidates.map((candidate) => ({ raw: candidate.relevanceRaw })));

    const retrieved = candidates
      .map((candidate, index) => {
        const recency = recencyScores[index] ?? 0;
        const importance = importanceScores[index] ?? 0;
        const relevance = relevanceScores[index] ?? 0;
        return {
          memory: candidate.memory,
          recencyScore: Number(recency.toFixed(3)),
          importanceScore: Number(importance.toFixed(3)),
          relevanceScore: Number(relevance.toFixed(3)),
          decayedImportance: candidate.decayedImportance,
          score: Number(
            (
              recency * RETRIEVAL_WEIGHTS.recency +
              relevance * RETRIEVAL_WEIGHTS.relevance +
              importance * RETRIEVAL_WEIGHTS.importance
            ).toFixed(3),
          ),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 5);

    retrieved.forEach((result) => {
      result.memory.lastAccessedMinutes = nowMinutes;
      result.memory.accessCount = (result.memory.accessCount ?? 0) + 1;
    });

    return retrieved;
  }

  decayedImportance(memory: MemoryEntry, nowMinutes: number): number {
    const ageMinutes = minutesSince(nowMinutes, memory.timeMinutes);
    const decayFactor = Math.pow(0.5, ageMinutes / DECAY_HALF_LIFE_MINUTES);
    return Number((memory.importance * decayFactor).toFixed(2));
  }
}

export const memoryStore = new MemoryStore();
