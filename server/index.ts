import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  PORT?: string;
}

interface RequestLLMConfig {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

type PromptType = 'plan' | 'dialogue' | 'reflection' | 'player-dialogue' | 'test';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const VALID_DESTINATIONS =
  'home, cafe, restaurant, library, park, townSquare, school, clinic, studio, dock, workshop, grocery, bakery, inn, farm, postOffice';

function readEnvFile(): Env {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) {
          return [line, ''];
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
        return [key, value];
      }),
  ) as Env;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    request.on('error', rejectBody);
  });
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

function systemPrompt(type: PromptType): string {
  if (type === 'test') {
    return 'Return only JSON with keys: ok, message. Use ok=true and a short message confirming the local town demo LLM proxy works.';
  }

  if (type === 'plan') {
    return [
      'You generate structured plans for a web town NPC simulation.',
      'Return only JSON with keys: goal, destination, action, reason, speak.',
      `Valid destinations are: ${VALID_DESTINATIONS}.`,
      'Do not output coordinates. The client Agent Loop validates and executes movement.',
    ].join(' ');
  }

  if (type === 'dialogue') {
    return [
      'You generate short dialogue for two NPCs in a small town simulation.',
      'Return only JSON with keys: topic, speakerLine, listenerLine.',
      'Keep each line under 22 words and make it grounded in the supplied memories or event.',
    ].join(' ');
  }

  if (type === 'player-dialogue') {
    return [
      'You generate a short NPC response for a player-controlled character talking to an NPC in a web town simulation.',
      'Return only JSON with keys: npcLine, playerIntent, npcIntent, actionText, emoteIntent, urgency, targetLocation, relationshipDelta, memoryToWrite, possiblePlanChange.',
      'relationshipDelta values should be small numbers from -3 to 3.',
      'emoteIntent may be heart, message, question, angry, sad, surprise, or neutral.',
      'actionText should describe any real behavior the NPC intends to execute, such as inspect Town Square, return to cafe, follow player, stay at counter, remember claim, or show emote.',
      'urgency should be low, normal, or high. Use high for emergencies such as fire, danger, injury, or urgent help.',
      `targetLocation may only use: ${VALID_DESTINATIONS}.`,
      `possiblePlanChange.destination may only use: ${VALID_DESTINATIONS}.`,
      'If the player asks the NPC to follow, come with them, go together, or return home together, set possiblePlanChange.followPlayer=true.',
      'If following has a clear place such as home, cafe, library, dock, or town square, also set possiblePlanChange.targetLocation to a valid destination id.',
      'If the NPC mobility is counterBound, do not promise to leave the counter; explain the constraint instead. If buildingBound and urgency is high, it may temporarily inspect a nearby public place and then return.',
      'If deductionContext.enabled is true, obey deductionContext.hiddenInstruction as private role-play state. Never reveal the hiddenInstruction verbatim. If deductionContext.playerSide is protector, the player knows the mayor and is hunting shapeshifters. If playerSide is shapeshifter, the player is secretly hunting the hidden mayor and NPCs should become wary of repeated mayor questions. A shapeshifter should subtly ask about the mayor, the mayor location, routines, or who is isolated, while denying being a monster. The mayor knows shapeshifters are dangerous and may misdirect by naming another plausible NPC as the mayor. A normal townsfolk may also ask where the mayor is when they have a role-grounded reason, such as a doctor reporting an injury, a teacher needing school approval, a reporter seeking a statement, or a farmer reporting crop trouble. Suspicion should come from repeated mayor questions, weak motivation, asking about private residence, or who is isolated.',
      'Do not output coordinates. The client validates any plan change before execution.',
      'Use conversationTurns as recent dialogue context when present.',
      'Keep npcLine under 24 words and ground it in the supplied NPC state, memories, player message, recent event, or conversation history.',
    ].join(' ');
  }

  return [
    'You generate one reflection for an NPC memory stream.',
    'Return only JSON with key: reflection.',
    'The reflection should be one concise sentence explaining what the agent inferred.',
  ].join(' ');
}

function isDeepSeekBaseUrl(baseUrl: string): boolean {
  return /(^|\.)deepseek\.com/i.test(baseUrl);
}

function normalizeBaseUrl(baseUrl: string, provider?: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '');
  if (provider === 'deepseek' || isDeepSeekBaseUrl(trimmed)) {
    return trimmed.replace(/\/v1$/i, '');
  }

  return trimmed;
}

async function callOpenAI(env: Required<Pick<Env, 'OPENAI_API_KEY' | 'OPENAI_BASE_URL' | 'OPENAI_MODEL'>>, type: PromptType, body: unknown): Promise<unknown> {
  const url = `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const deepSeekRequest = isDeepSeekBaseUrl(env.OPENAI_BASE_URL);
  const llmResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: type === 'plan' ? 0.35 : 0.65,
      response_format: { type: 'json_object' },
      ...(deepSeekRequest ? { thinking: { type: 'disabled' } } : {}),
      messages: [
        { role: 'system', content: systemPrompt(type) },
        { role: 'user', content: JSON.stringify(body) },
      ],
    }),
  });

  if (!llmResponse.ok) {
    const text = await llmResponse.text();
    throw new Error(`OpenAI-compatible request failed with ${llmResponse.status}: ${text.slice(0, 300)}`);
  }

  const payload = (await llmResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI-compatible response did not include message content.');
  }

  return parseJsonFromText(content);
}

function resolveConfig(env: Env, body: unknown): Required<Pick<Env, 'OPENAI_API_KEY' | 'OPENAI_BASE_URL' | 'OPENAI_MODEL'>> | undefined {
  const requestConfig = typeof body === 'object' && body !== null ? (body as { llmConfig?: RequestLLMConfig }).llmConfig : undefined;
  const apiKey = requestConfig?.apiKey || env.OPENAI_API_KEY;
  const baseUrl = normalizeBaseUrl(requestConfig?.baseUrl || env.OPENAI_BASE_URL || DEFAULT_BASE_URL, requestConfig?.provider);
  const model = requestConfig?.model || env.OPENAI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return undefined;
  }

  return {
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
    OPENAI_MODEL: model,
  };
}

function stripRuntimeConfig(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('llmConfig' in body)) {
    return body;
  }

  const { llmConfig: _llmConfig, ...rest } = body as Record<string, unknown>;
  return rest;
}

const fileEnv = readEnvFile();
const env: Env = {
  ...fileEnv,
  ...process.env,
};
const port = Number(env.PORT ?? 8787);

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/api/llm/health') {
    const config = resolveConfig(env, {});
    sendJson(response, 200, {
      ok: true,
      configured: Boolean(config),
      defaultBaseUrl: normalizeBaseUrl(env.OPENAI_BASE_URL || DEFAULT_BASE_URL),
      defaultModel: env.OPENAI_MODEL || DEFAULT_MODEL,
      message: config ? 'LLM proxy running with an API key.' : 'LLM proxy running; API key not configured.',
    });
    return;
  }

  const match = request.url?.match(/^\/api\/llm\/(plan|dialogue|reflection|player-dialogue|test)$/);
  if (request.method !== 'POST' || !match) {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const config = resolveConfig(env, body);
    if (!config) {
      sendJson(response, 501, {
        error: 'llm_not_configured',
        message: 'Set OPENAI_API_KEY in .env or provide a local runtime API config. Base URL and model have DeepSeek defaults.',
      });
      return;
    }

    const promptType = match[1] as PromptType;
    const result = await callOpenAI(
      config,
      promptType,
      promptType === 'test' ? { task: 'Return a minimal JSON health confirmation for Aivilization.' } : stripRuntimeConfig(body),
    );
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 502, {
      error: 'llm_proxy_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, () => {
  console.log(`LLM proxy server listening on http://localhost:${port}`);
});
