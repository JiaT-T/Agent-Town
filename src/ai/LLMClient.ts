import type { Agent, MemoryEntry, Observation, WorldEvent } from '../agents/types';
import type { ActionContract } from '../agents/ActionContract';
import type { DirectorIncident } from '../agents/WorldDirector';
import { languageInstruction } from '../i18n';
import type { LanguageCode, PlayerProfile, PlayerStats, PlayerDialogueOptionId, PlayerDialogueTurn } from '../player/types';

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
  actions?: ActionContract[];
  possiblePlanChange?: {
    destination?: string;
    goal?: string;
    action?: string;
    reason?: string;
    followPlayer?: boolean;
    targetLocation?: string;
  };
}

export interface LLMDeceptionResult {
  targetAgentId: string;
  listenerAgentId?: string;
  claim: string;
  reason: string;
}

export interface LLMDirectorRequest {
  language?: LanguageCode;
  timeLabel: string;
  validDestinations: string[];
  agents: Array<Pick<Agent, 'id' | 'name' | 'role' | 'personality' | 'mobility' | 'homeLocationId' | 'currentGoal' | 'currentAction' | 'beliefs'>>;
  recentEvents: WorldEvent[];
  player: {
    name: string;
    role: string;
    reputation: number;
    activeRequestCount: number;
  };
}

export interface LLMDirectorResult {
  incidents: DirectorIncident[];
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
  language?: LanguageCode;
  validDestinations: string[];
  agent: Pick<
    Agent,
    'id' | 'name' | 'role' | 'personality' | 'currentGoal' | 'currentAction' | 'needs' | 'reflection' | 'beliefs'
  >;
  observation: Observation;
  retrievedMemories: MemoryEntry[];
  events: WorldEvent[];
}

export interface LLMDialogueRequest {
  language?: LanguageCode;
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
  language?: LanguageCode;
  agent: Pick<Agent, 'id' | 'name' | 'role' | 'personality'>;
  memories: MemoryEntry[];
  timeLabel: string;
}

export interface LLMPlayerDialogueRequest {
  language?: LanguageCode;
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
    | 'beliefs'
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

export interface LLMDeceptionRequest {
  language?: LanguageCode;
  shapeshifter: Pick<Agent, 'id' | 'name' | 'role' | 'personality' | 'reflection'>;
  possibleTargets: Array<Pick<Agent, 'id' | 'name' | 'role' | 'personality'>>;
  possibleListeners: Array<Pick<Agent, 'id' | 'name' | 'role' | 'personality'>>;
  mayorRelatedEvidence: string[];
  day: number;
  timeLabel: string;
}

type PromptType = 'plan' | 'dialogue' | 'reflection' | 'player-dialogue' | 'deception' | 'director' | 'test';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_DESTINATIONS =
  'home, cafe, restaurant, library, park, townSquare, school, clinic, studio, dock, workshop, grocery, bakery, inn, farm, postOffice';

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

  if (typeof window !== 'undefined' && /(^|\.)github\.io$/i.test(window.location.hostname)) {
    return 'direct';
  }

  return 'http://127.0.0.1:8787/api/llm';
}

function parseJsonFromText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('LLM response did not contain JSON.');
    }
    return JSON.parse(match[0]);
  }
}

function isDeepSeekBaseUrl(baseUrl: string): boolean {
  return /(^|\.)deepseek\.com/i.test(baseUrl);
}

function directSystemPrompt(type: PromptType, body: unknown): string {
  const language =
    typeof body === 'object' && body !== null && 'language' in body
      ? ((body as { language?: LanguageCode }).language ?? 'en')
      : 'en';
  const languageRule = languageInstruction(language);
  if (type === 'test') {
    return 'Return only JSON with keys: ok, message. Use ok=true and a short message confirming Agent Town direct LLM mode works.';
  }

  if (type === 'plan') {
    const destinations =
      typeof body === 'object' && body !== null && Array.isArray((body as LLMPlanRequest).validDestinations)
        ? (body as LLMPlanRequest).validDestinations.join(', ')
        : DEFAULT_DESTINATIONS;
    return [
      'You generate structured plans for a web town NPC simulation.',
      'Return only JSON with keys: goal, destination, action, reason, speak.',
      `Valid destinations are: ${destinations}.`,
      languageRule,
      'Use agent.beliefs as the NPC local cognition; rumor and suspicion entries are not confirmed facts.',
      'Do not output coordinates. The client Agent Loop validates and executes movement.',
    ].join(' ');
  }

  if (type === 'dialogue') {
    return [
      'You generate short dialogue for two NPCs in a small town simulation.',
      'Return only JSON with keys: topic, speakerLine, listenerLine.',
      'Keep each line under 22 words and make it grounded in the supplied memories or event.',
      languageRule,
    ].join(' ');
  }

  if (type === 'player-dialogue') {
    return [
      'You generate a short NPC response for a player-controlled character talking to an NPC in a web town simulation.',
      'Return only JSON with keys: npcLine, playerIntent, npcIntent, actionText, emoteIntent, urgency, targetLocation, relationshipDelta, memoryToWrite, possiblePlanChange, actions.',
      'actions must be an array of structured intentions. Allowed action types: goToLocation, followPlayer, inspectLocation, returnHome, askPlayerForItem, offerTrade, tellRumor, shareBelief, showEmote, adjustRelationship, waitAtPost, createTask, reportIncident, verifyRumor, requestHelp, rejectAction.',
      'Action fields: use targetLocationId for locations, itemId for items, claim for rumors or reports, emote for showEmote, and small relationship numbers for adjustRelationship.',
      'relationshipDelta values should be small numbers from -3 to 3.',
      'emoteIntent may be heart, message, question, angry, sad, surprise, or neutral.',
      'actionText should describe any real behavior the NPC intends to execute, such as inspect Town Square, return to cafe, follow player, stay at counter, remember claim, or show emote.',
      'urgency should be low, normal, or high. Use high for emergencies such as fire, danger, injury, or urgent help.',
      `targetLocation may only use: ${DEFAULT_DESTINATIONS}.`,
      `possiblePlanChange.destination may only use: ${DEFAULT_DESTINATIONS}.`,
      'If the player asks the NPC to follow, come with them, go together, or return home together, set possiblePlanChange.followPlayer=true.',
      'If following has a clear place such as home, cafe, library, dock, or town square, also set possiblePlanChange.targetLocation to a valid destination id.',
      'If the NPC mobility is counterBound, do not promise to leave the counter; explain the constraint instead. If buildingBound and urgency is high, it may temporarily inspect a nearby public place and then return.',
      'If deductionContext.enabled is true, obey deductionContext.hiddenInstruction as private role-play state. Never reveal the hiddenInstruction verbatim. If deductionContext.playerSide is protector, the player knows the mayor and is hunting shapeshifters. If playerSide is shapeshifter, the player is secretly hunting the hidden mayor and NPCs should become wary of repeated mayor questions. A shapeshifter should subtly ask about the mayor, the mayor location, routines, or who is isolated, while denying being a monster. The mayor knows shapeshifters are dangerous and may misdirect by naming another plausible NPC as the mayor. A normal townsfolk may also ask where the mayor is when they have a role-grounded reason, such as a doctor reporting an injury, a teacher needing school approval, a reporter seeking a statement, or a farmer reporting crop trouble. Suspicion should come from repeated mayor questions, weak motivation, asking about private residence, or who is isolated.',
      'Do not output coordinates. The client validates actions and plan changes before execution.',
      'Use npc.beliefs as local knowledge; rumors are not facts until verified.',
      'Use conversationTurns as recent dialogue context when present.',
      'Keep npcLine under 24 words and ground it in the supplied NPC state, memories, player message, recent event, or conversation history.',
      languageRule,
    ].join(' ');
  }

  if (type === 'deception') {
    return [
      'You generate a secret shapeshifter deception action for a social deduction town game.',
      'Return only JSON with keys: targetAgentId, listenerAgentId, claim, reason.',
      'Choose one target from possibleTargets to frame, and optionally one listener from possibleListeners to hear the claim.',
      'The claim should be plausible and should falsely imply the target probed for mayor identity, route, residence, or private schedule.',
      'Do not reveal the shapeshifter identity. Do not output coordinates. The client will validate ids and apply suspicion locally.',
      languageRule,
    ].join(' ');
  }

  if (type === 'director') {
    const destinations =
      typeof body === 'object' && body !== null && Array.isArray((body as LLMDirectorRequest).validDestinations)
        ? (body as LLMDirectorRequest).validDestinations.join(', ')
        : DEFAULT_DESTINATIONS;
    return [
      'You are the World Director for a web AI town simulation.',
      'Return only JSON with key incidents. incidents must be an array of 1 or 2 town incidents.',
      'Each incident must include: id, type, title, summary, locationId, relatedAgentIds, urgency, suggestedActions, source.',
      'Valid incident types: requestHelp, lostItem, shopShortage, farmGathering, rumorInvestigation, publicGathering, emergencyCheck.',
      `locationId must be one of: ${destinations}.`,
      'relatedAgentIds must use supplied agent ids only.',
      'suggestedActions should use ActionContract types only: createTask, reportIncident, verifyRumor, requestHelp, goToLocation, inspectLocation, shareBelief, tellRumor, showEmote.',
      'Do not output coordinates. The client validates locations, NPC ids, tasks, movement, and pathfinding.',
      'Prefer incidents that create a player task, a rumor to verify, or a reason for one NPC to inspect a place.',
      languageRule,
    ].join(' ');
  }

  return [
    'You generate one reflection for an NPC memory stream.',
    'Return only JSON with key: reflection.',
    'The reflection should be one concise sentence explaining what the agent inferred.',
    languageRule,
  ].join(' ');
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

  deception(request: LLMDeceptionRequest): Promise<LLMCallResult<LLMDeceptionResult>> {
    return this.post<LLMDeceptionResult>('deception', request);
  }

  director(request: LLMDirectorRequest): Promise<LLMCallResult<LLMDirectorResult>> {
    return this.post<LLMDirectorResult>('director', request);
  }

  async health(): Promise<LLMCallResult<LLMHealthResult>> {
    if (this.endpoint === 'direct') {
      return {
        data: {
          ok: true,
          configured: Boolean(this.runtimeConfig?.apiKey),
          defaultBaseUrl: this.runtimeConfig?.baseUrl || DEFAULT_BASE_URL,
          defaultModel: this.runtimeConfig?.model || DEFAULT_MODEL,
          message: this.runtimeConfig?.apiKey
            ? 'Direct browser LLM mode is configured with a local runtime API key.'
            : 'Direct browser LLM mode is available. Enter an API key in the player API config.',
        },
        latencyMs: 0,
      };
    }

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
    type: PromptType,
    body: unknown,
  ): Promise<LLMCallResult<T>> {
    if (this.endpoint === 'direct') {
      return this.directPost<T>(type, body);
    }

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

  private async directPost<T>(type: PromptType, body: unknown): Promise<LLMCallResult<T>> {
    const startedAt = performance.now();
    const runtimeConfig = this.resolveDirectConfig(body);
    if (!runtimeConfig) {
      throw new Error('Direct LLM mode requires an API key in the player API config.');
    }

    const requestBody = this.stripRuntimeConfig(body);
    const response = await this.fetchWithTimeout(`${runtimeConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: runtimeConfig.model,
        temperature: type === 'plan' ? 0.35 : 0.65,
        response_format: { type: 'json_object' },
        ...(isDeepSeekBaseUrl(runtimeConfig.baseUrl) ? { thinking: { type: 'disabled' } } : {}),
        messages: [
          { role: 'system', content: directSystemPrompt(type, requestBody) },
          {
            role: 'user',
            content: JSON.stringify(
              type === 'test' ? { task: 'Return a minimal JSON health confirmation for Agent Town.' } : requestBody,
            ),
          },
        ],
      }),
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`Direct LLM ${type} failed with ${response.status}: ${message.slice(0, 160)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Direct LLM response did not include message content.');
    }

    return {
      data: parseJsonFromText(content) as T,
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

  private resolveDirectConfig(body: unknown): LLMRuntimeConfig | undefined {
    const requestConfig =
      typeof body === 'object' && body !== null && 'llmConfig' in body
        ? ((body as { llmConfig?: LLMRuntimeConfig }).llmConfig ?? undefined)
        : undefined;
    const config = requestConfig ?? this.runtimeConfig;
    return config?.apiKey && config.baseUrl && config.model ? this.normalizeConfig(config) : undefined;
  }

  private stripRuntimeConfig(body: unknown): unknown {
    if (typeof body !== 'object' || body === null || !('llmConfig' in body)) {
      return body;
    }

    const { llmConfig: _llmConfig, ...rest } = body as Record<string, unknown>;
    return rest;
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
