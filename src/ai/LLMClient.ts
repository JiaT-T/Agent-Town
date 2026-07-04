import type { Agent, MemoryEntry, Observation, WorldEvent } from '../agents/types';
import type { PlayerProfile, PlayerStats, PlayerDialogueOptionId, PlayerDialogueTurn } from '../player/types';

export interface LLMPlanResult {
  goal: string;
  destination: string;
  action: string;
  reason: string;
  speak?: string;
}

export interface LLMDialogueResult {
  topic: string;
  speakerLine: string;
  listenerLine: string;
}

export interface LLMReflectionResult {
  reflection: string;
}

export interface LLMPlayerDialogueResult {
  npcLine: string;
  playerIntent: string;
  npcIntent: string;
  actionText?: string;
  emoteIntent?: string;
  urgency?: 'low' | 'normal' | 'high';
  targetLocation?: string;
  relationshipDelta?: {
    familiarity?: number;
    trust?: number;
    affinity?: number;
  };
  memoryToWrite?: string;
  possiblePlanChange?: {
    destination?: string;
    goal?: string;
    action?: string;
    reason?: string;
    followPlayer?: boolean;
    targetLocation?: string;
  };
}

export interface LLMCallResult<T> {
  data: T;
  latencyMs: number;
}

export type LLMProvider = 'deepseek' | 'openai' | 'claude' | 'custom';

export interface LLMRuntimeConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  useFallback: boolean;
}

export interface LLMHealthResult {
  ok: boolean;
  configured: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  message: string;
}

export interface LLMTestResult {
  ok: boolean;
  message: string;
}

export interface LLMPlanRequest {
  validDestinations: string[];
  agent: Pick<
    Agent,
    'id' | 'name' | 'role' | 'personality' | 'currentGoal' | 'currentAction' | 'needs' | 'reflection'
  >;
  observation: Observation;
  retrievedMemories: MemoryEntry[];
  events: WorldEvent[];
}

export interface LLMDialogueRequest {
  speaker: Pick<Agent, 'id' | 'name' | 'role' | 'personality' | 'reflection'>;
  listener: Pick<Agent, 'id' | 'name' | 'role' | 'personality' | 'reflection'>;
  locationName: string;
  timeLabel: string;
  topicHint: string;
  speakerMemories: MemoryEntry[];
  listenerMemories: MemoryEntry[];
  recentEvents: WorldEvent[];
}

export interface LLMReflectionRequest {
  agent: Pick<Agent, 'id' | 'name' | 'role' | 'personality'>;
  memories: MemoryEntry[];
  timeLabel: string;
}

export interface LLMPlayerDialogueRequest {
  player: {
    profile: PlayerProfile;
    stats: PlayerStats;
  };
  npc: Pick<
    Agent,
    | 'id'
    | 'name'
    | 'role'
    | 'personality'
    | 'currentGoal'
    | 'currentAction'
    | 'reason'
    | 'mobility'
    | 'homeLocationId'
    | 'needs'
    | 'reflection'
    | 'memories'
  >;
  timeLabel: string;
  locationName: string;
  optionId?: PlayerDialogueOptionId;
  playerMessage: string;
  conversationTurns: PlayerDialogueTurn[];
  recentEvents: WorldEvent[];
  deductionContext?: {
    enabled: boolean;
    day: number;
    phase: string;
    playerSide: 'protector' | 'shapeshifter';
    playerKnowsMayorName?: string;
    aliveNames: string[];
    hiddenInstruction?: string;
    playerDialoguesRemaining: number;
  };
}

function defaultEndpoint(): string {
  if (typeof window !== 'undefined') {
    const storedEndpoint = window.localStorage.getItem('aivilization.llmEndpoint')?.trim();
    if (storedEndpoint) {
      return storedEndpoint.replace(/\/+$/, '');
    }
  }

  const envEndpoint = import.meta.env.VITE_LLM_ENDPOINT?.trim();
  if (envEndpoint) {
    return envEndpoint.replace(/\/+$/, '');
  }

  return 'http://127.0.0.1:8787/api/llm';
}

export class LLMClient {
  private runtimeConfig?: LLMRuntimeConfig;

  constructor(private readonly endpoint = defaultEndpoint()) {}

  configure(config: LLMRuntimeConfig | undefined): void {
    const normalized = config ? this.normalizeConfig(config) : undefined;
    this.runtimeConfig = normalized?.apiKey && normalized.baseUrl && normalized.model ? normalized : undefined;
    if (typeof window === 'undefined') {
      return;
    }

    if (this.runtimeConfig) {
      window.localStorage.setItem('aivilization.llmConfig', JSON.stringify(this.runtimeConfig));
    } else {
      window.localStorage.removeItem('aivilization.llmConfig');
    }
  }

  loadStoredConfig(): LLMRuntimeConfig | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const raw = window.localStorage.getItem('aivilization.llmConfig');
    if (!raw) {
      return undefined;
    }

    try {
      const parsed = this.normalizeConfig(JSON.parse(raw) as LLMRuntimeConfig);
      this.runtimeConfig = parsed.apiKey && parsed.baseUrl && parsed.model ? parsed : undefined;
      return this.runtimeConfig;
    } catch {
      return undefined;
    }
  }

  plan(request: LLMPlanRequest): Promise<LLMCallResult<LLMPlanResult>> {
    return this.post<LLMPlanResult>('plan', request);
  }

  dialogue(request: LLMDialogueRequest): Promise<LLMCallResult<LLMDialogueResult>> {
    return this.post<LLMDialogueResult>('dialogue', request);
  }

  reflection(request: LLMReflectionRequest): Promise<LLMCallResult<LLMReflectionResult>> {
    return this.post<LLMReflectionResult>('reflection', request);
  }

  playerDialogue(request: LLMPlayerDialogueRequest): Promise<LLMCallResult<LLMPlayerDialogueResult>> {
    return this.post<LLMPlayerDialogueResult>('player-dialogue', request);
  }

  async health(): Promise<LLMCallResult<LLMHealthResult>> {
    const startedAt = performance.now();
    const response = await this.fetchWithTimeout(`${this.endpoint}/health`, {
      method: 'GET',
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`LLM proxy health failed with ${response.status}: ${message.slice(0, 160)}`);
    }

    return {
      data: (await response.json()) as LLMHealthResult,
      latencyMs,
    };
  }

  test(config?: LLMRuntimeConfig): Promise<LLMCallResult<LLMTestResult>> {
    const normalized = config ? this.normalizeConfig(config) : this.runtimeConfig;
    return this.post<LLMTestResult>('test', normalized ? { llmConfig: normalized } : {});
  }

  private async post<T>(
    type: 'plan' | 'dialogue' | 'reflection' | 'player-dialogue' | 'test',
    body: unknown,
  ): Promise<LLMCallResult<T>> {
    const startedAt = performance.now();
    const payload =
      this.runtimeConfig && typeof body === 'object' && body !== null
        ? {
            ...(body as Record<string, unknown>),
            llmConfig: this.runtimeConfig,
          }
        : body;
    const response = await this.fetchWithTimeout(`${this.endpoint}/${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`LLM ${type} failed with ${response.status}: ${message.slice(0, 160)}`);
    }

    return {
      data: (await response.json()) as T,
      latencyMs,
    };
  }

  private normalizeConfig(config: LLMRuntimeConfig): LLMRuntimeConfig {
    const baseUrl = config.provider === 'deepseek'
      ? config.baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
      : config.baseUrl.trim().replace(/\/+$/, '');
    return {
      ...config,
      baseUrl,
      model: config.model.trim(),
      apiKey: config.apiKey.trim(),
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('LLM request timed out after 20s.');
      }
      if (error instanceof TypeError) {
        const hostedStaticPage =
          typeof window !== 'undefined' && /(^|\.)github\.io$/i.test(window.location.hostname);
        throw new Error(
          hostedStaticPage
            ? 'LLM proxy offline. GitHub Pages only hosts the static frontend; run the local proxy or configure a deployed backend endpoint.'
            : 'LLM proxy offline. Start it with pnpm run dev or pnpm run server.',
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
