const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const VALID_DESTINATIONS =
  'home, cafe, restaurant, library, park, townSquare, school, clinic, studio, dock, workshop, grocery, bakery, inn, farm, postOffice';

function allowedOrigin(origin) {
  if (!origin) {
    return '*';
  }

  if (
    origin === 'https://jiat-t.github.io' ||
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173'
  ) {
    return origin;
  }

  return 'https://jiat-t.github.io';
}

function setCors(request, response) {
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin(request.headers.origin));
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function parseJsonFromText(text) {
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

function systemPrompt(type) {
  if (type === 'test') {
    return 'Return only JSON with keys: ok, message. Use ok=true and a short message confirming the Agent Town hosted LLM proxy works.';
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

function isDeepSeekBaseUrl(baseUrl) {
  return /(^|\.)deepseek\.com/i.test(baseUrl);
}

function normalizeBaseUrl(baseUrl, provider) {
  const trimmed = String(baseUrl || '').trim().replace(/\/$/, '');
  if (provider === 'deepseek' || isDeepSeekBaseUrl(trimmed)) {
    return trimmed.replace(/\/v1$/i, '');
  }

  return trimmed;
}

function resolveConfig(body) {
  const requestConfig = body && typeof body === 'object' ? body.llmConfig : undefined;
  const allowServerKey = process.env.AIVILIZATION_ALLOW_SERVER_KEY === '1';
  const apiKey = requestConfig?.apiKey || (allowServerKey ? process.env.OPENAI_API_KEY : undefined);
  const baseUrl = normalizeBaseUrl(
    requestConfig?.baseUrl || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    requestConfig?.provider,
  );
  const model = requestConfig?.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return undefined;
  }

  return { apiKey, baseUrl, model };
}

function stripRuntimeConfig(body) {
  if (!body || typeof body !== 'object' || !('llmConfig' in body)) {
    return body;
  }

  const { llmConfig: _llmConfig, ...rest } = body;
  return rest;
}

async function callOpenAI(config, type, body) {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const deepSeekRequest = isDeepSeekBaseUrl(config.baseUrl);
  const llmResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
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

  const payload = await llmResponse.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI-compatible response did not include message content.');
  }

  return parseJsonFromText(content);
}

export default async function handler(request, response) {
  setCors(request, response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  const type = request.query?.type;
  if (type === 'health' && request.method === 'GET') {
    response.status(200).json({
      ok: true,
      hosted: true,
      configured: process.env.AIVILIZATION_ALLOW_SERVER_KEY === '1' && Boolean(process.env.OPENAI_API_KEY),
      defaultBaseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL),
      defaultModel: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      message:
        process.env.AIVILIZATION_ALLOW_SERVER_KEY === '1'
          ? 'Hosted LLM proxy running. Server API key usage is enabled.'
          : 'Hosted LLM proxy running. Provide an API key in the player API config.',
    });
    return;
  }

  if (!['plan', 'dialogue', 'reflection', 'player-dialogue', 'test'].includes(type) || request.method !== 'POST') {
    response.status(404).json({ error: 'not_found' });
    return;
  }

  try {
    const body = request.body || {};
    const config = resolveConfig(body);
    if (!config) {
      response.status(501).json({
        error: 'llm_not_configured',
        message:
          'Provide an API key in the player API config, or set OPENAI_API_KEY and AIVILIZATION_ALLOW_SERVER_KEY=1 on the hosted proxy.',
      });
      return;
    }

    const result = await callOpenAI(
      config,
      type,
      type === 'test' ? { task: 'Return a minimal JSON health confirmation for Agent Town.' } : stripRuntimeConfig(body),
    );
    response.status(200).json(result);
  } catch (error) {
    response.status(502).json({
      error: 'llm_proxy_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
