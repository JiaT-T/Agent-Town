import type { AgentSimulation, ShapeshifterSkillId } from '../agents/AgentSimulation';
import type { Agent, AgentNeeds, ScheduleEntry } from '../agents/types';
import { makeAppearance } from '../appearance/types';
import type { LLMProvider, LLMRuntimeConfig } from '../ai/LLMClient';
import { resolveCharacterFrame } from '../assets/manifest';
import { findLocationAt, LOCATION_BY_ID, type LocationId } from '../data/locations';
import { locationTargetWorld } from '../data/townGrid';
import { stopGameHotkeysDuringTextEntry } from '../game/InputFocusGuard';
import type { PerformanceMonitor } from '../performance/PerformanceMonitor';
import type { GameMode, PlayerDialogueOptionId, PlayerGender, PlayerRole, PlayerState, PlayerStats } from '../player/types';

const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  custom: { baseUrl: '', model: '' },
};

const CHARACTER_SHEET_URL = '/assets/kenney/roguelike-characters/Spritesheet/roguelikeChar_transparent.png';
const CHARACTER_SHEET_COLUMNS = 54;
const CHARACTER_FRAME_STRIDE = 17;
const CHARACTER_AVATAR_SCALE = 3;
const DEDUCTION_SKILL_LOCATIONS: LocationId[] = ['townSquare', 'park', 'cafe', 'library', 'dock', 'postOffice'];

const OUTFIT_TINTS: Record<string, number> = {
  blue: 0xffffff,
  green: 0xdfffe8,
  red: 0xffe4e6,
  purple: 0xf3e8ff,
  teal: 0xccfbf1,
};

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing DOM element #${id}`);
  }
  return element as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function needBar(label: keyof AgentNeeds, value: number): string {
  const safeValue = Math.round(value);
  return `
    <div class="need-row">
      <span>${label}</span>
      <div class="need-track"><div class="need-fill" style="width: ${safeValue}%"></div></div>
      <strong>${safeValue}</strong>
    </div>
  `;
}

function playerStatBar(label: keyof PlayerStats, value: number): string {
  const safeValue = Math.round(value);
  return `
    <div class="need-row player-stat-row">
      <span>${label}</span>
      <div class="need-track"><div class="need-fill player-stat-fill" style="width: ${safeValue}%"></div></div>
      <strong>${safeValue}</strong>
    </div>
  `;
}

function renderPlayerHud(player: PlayerState, npcCount: number): string {
  const location = findLocationAt(player.position);
  const quest = player.quest;
  const tags = player.profile.personalityTags.map(escapeHtml).join(', ');
  const requests = player.requests.slice(0, 3);

  return `
    <button class="panel-toggle" type="button" data-collapse-target="player-hud">Player</button>
    <div class="player-heading">
      <div>
        <span class="label">Player</span>
        <h2>${escapeHtml(player.profile.name)}</h2>
      </div>
      <span class="mood-pill">${escapeHtml(player.profile.role)}</span>
    </div>
    <p class="player-meta">${escapeHtml(tags)} | ${location ? location.name : 'Town path'} | NPCs active: ${npcCount}</p>
    <div class="player-stats">
      ${playerStatBar('energy', player.stats.energy)}
      ${playerStatBar('social', player.stats.social)}
      ${playerStatBar('hunger', player.stats.hunger)}
      ${playerStatBar('reputation', player.stats.reputation)}
      ${playerStatBar('curiosity', player.stats.curiosity)}
    </div>
    <div class="player-quest">
      <strong>${escapeHtml(quest.title)}</strong>
      <span>Talk ${Math.min(quest.talkedNpcIds.length, 2)}/2 | Invite ${Math.min(
        quest.invitedNpcIds.length,
        2,
      )}/2 | 18:00 gathering</span>
      ${quest.completed ? `<em>${escapeHtml(quest.completionMessage ?? 'Completed')}</em>` : ''}
    </div>
    <div class="player-requests">
      <strong>Requests</strong>
      ${
        requests.length
          ? requests
              .map(
                (request) => `
                  <span class="${request.status === 'completed' ? 'is-complete' : ''}">
                    ${escapeHtml(request.title)} ${request.status === 'completed' ? 'done' : `${request.progress}/${request.required}`}
                  </span>
                `,
              )
              .join('')
          : '<span>No role requests yet.</span>'
      }
    </div>
  `;
}

function renderInventoryGrid(player: PlayerState, slotCount = 24): string {
  const slots = Array.from({ length: slotCount }, (_, index) => player.inventory[index]);
  return slots
    .map((item) => {
      if (!item) {
        return '<div class="inventory-slot" aria-label="empty inventory slot"></div>';
      }

      const icon = item.name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      return `
        <div class="inventory-slot has-item" title="${escapeHtml(item.name)}">
          <span class="inventory-item-icon">${escapeHtml(icon)}</span>
          <span class="inventory-item-name">${escapeHtml(item.name)}</span>
          <strong class="inventory-item-qty">${item.quantity}</strong>
        </div>
      `;
    })
    .join('');
}

function scheduleList(schedule: ScheduleEntry[]): string {
  return schedule
    .map((entry) => `<li><span>${entry.start}</span>${LOCATION_BY_ID[entry.locationId].name}: ${escapeHtml(entry.action)}</li>`)
    .join('');
}

function timeLabelFromMinutes(minutes: number): string {
  const normalized = Math.floor(minutes) % (24 * 60);
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const mins = (normalized % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

function dailyPlanList(agent: Agent): string {
  if (agent.dailyPlan.length === 0) {
    return '<li>Daily plan will be generated on the next decision tick.</li>';
  }

  return agent.dailyPlan
    .map(
      (entry) =>
        `<li><span>${timeLabelFromMinutes(entry.startMinutes)}</span>${LOCATION_BY_ID[entry.locationId].name}: ${escapeHtml(
          entry.action,
        )} (${entry.durationMinutes}m)</li>`,
    )
    .join('');
}

function taskDecompositionList(agent: Agent): string {
  if (agent.currentTaskDecomposition.length === 0) {
    return '<li>No task decomposition yet.</li>';
  }

  return agent.currentTaskDecomposition
    .map((entry) => `<li><span>${entry.durationMinutes}m</span>${escapeHtml(entry.action)}</li>`)
    .join('');
}

function moveText(agent: Agent): string {
  const destination = locationTargetWorld(agent.destination);
  const distanceToDestination = Math.hypot(destination.x - agent.position.x, destination.y - agent.position.y);
  const placeName = LOCATION_BY_ID[agent.destination].name;
  return distanceToDestination > 12 ? `Moving to ${placeName}.` : `Arrived at ${placeName}.`;
}

function memoryList(agent: Agent, memories = agent.memories.slice(0, 5)): string {
  return memories
    .map(
      (memory) =>
        `<li><span>${memory.time}</span><strong>[${memory.type}][${memory.importance}]</strong>${escapeHtml(memory.summary)}</li>`,
    )
    .join('');
}

function latestReflectionMemory(agent: Agent): string {
  const memory = agent.memories.find((candidate) => candidate.type === 'reflection');
  if (!memory) {
    return '<p class="next-plan">No reflection memory yet.</p>';
  }

  return `<ul class="compact-list memory-list"><li><span>${memory.time}</span><strong>[${memory.type}][${memory.importance}]</strong>${escapeHtml(
    memory.summary,
  )}</li></ul>`;
}

function relationshipList(agent: Agent): string {
  const entries = Object.entries(agent.relationships).slice(0, 5);
  if (entries.length === 0) {
    return '<li>No relationship changes yet.</li>';
  }

  return entries
    .map(
      ([agentId, relationship]) =>
        `<li><strong>${escapeHtml(agentId)}</strong> familiarity ${Math.round(relationship.familiarity)}, trust ${Math.round(
          relationship.trust,
        )}, affinity ${Math.round(relationship.affinity)}</li>`,
    )
    .join('');
}

function agentLoop(agent: Agent): string {
  const rows = [
    ['Observe', agent.lastObservation],
    [
      'Retrieve',
      agent.retrievedMemories.length
        ? agent.retrievedMemories.map((memory) => memory.summary).join(' | ')
        : 'No memory retrieved yet.',
    ],
    ['Reflect', agent.reflection],
    ['Plan', agent.lastPlan],
    ['Move', moveText(agent)],
    ['Act', agent.lastAction],
    ['Remember', agent.lastMemory],
  ];

  return rows
    .map(
      ([label, value]) => `
        <div class="loop-row">
          <span>${label}</span>
          <p>${escapeHtml(value)}</p>
        </div>
      `,
    )
    .join('');
}

function renderAgent(agent: Agent): string {
  const memories = memoryList(agent);
  const retrievedMemories = memoryList(agent, agent.retrievedMemories);

  return `
    <div class="agent-card">
      <div class="agent-heading">
        <div>
          <h2>${escapeHtml(agent.name)}</h2>
          <p>${escapeHtml(agent.role)}</p>
        </div>
        <span class="mood-pill">${escapeHtml(agent.mood)}</span>
      </div>

      <dl class="state-grid">
        <div><dt>Personality</dt><dd>${escapeHtml(agent.personality)}</dd></div>
        <div><dt>Goal</dt><dd>${escapeHtml(agent.currentGoal)}</dd></div>
        <div><dt>Action</dt><dd>${escapeHtml(agent.currentAction)}</dd></div>
        <div><dt>Reason</dt><dd>${escapeHtml(agent.reason)}</dd></div>
        <div><dt>Destination</dt><dd>${LOCATION_BY_ID[agent.destination].name}</dd></div>
        <div><dt>Mobility</dt><dd>${escapeHtml(agent.mobility)}</dd></div>
        <div><dt>Home Location</dt><dd>${agent.homeLocationId ? LOCATION_BY_ID[agent.homeLocationId].name : 'Town-wide'}</dd></div>
        <div><dt>Trade</dt><dd>${agent.tradeProfile?.enabled ? escapeHtml(agent.tradeProfile.displayName) : 'No trade interface'}</dd></div>
        <div><dt>Emote</dt><dd>${agent.emoteState ? escapeHtml(agent.emoteState.kind) : 'None'}</dd></div>
        <div><dt>Pending Message</dt><dd>${agent.pendingMessage ? escapeHtml(agent.pendingMessage.text) : 'None'}</dd></div>
        <div><dt>Relationship Note</dt><dd>${agent.relationshipDeltaReason ? escapeHtml(agent.relationshipDeltaReason) : 'None'}</dd></div>
        <div><dt>Current LLM Decision</dt><dd>${escapeHtml(agent.lastLLMDecision)}</dd></div>
        <div><dt>Pathfinding</dt><dd>${escapeHtml(agent.pathStatus)}</dd></div>
      </dl>

      <section>
        <h3>Agent Loop</h3>
        <div class="agent-loop">${agentLoop(agent)}</div>
        <p class="next-plan">${escapeHtml(agent.nextPlan)}</p>
      </section>

      <section>
        <h3>Needs</h3>
        ${needBar('energy', agent.needs.energy)}
        ${needBar('social', agent.needs.social)}
        ${needBar('hunger', agent.needs.hunger)}
      </section>

      <section>
        <h3>Retrieved Memories</h3>
        <ul class="compact-list memory-list">${retrievedMemories || '<li>No retrieved memories yet.</li>'}</ul>
      </section>

      <section>
        <h3>Reflection</h3>
        <p class="next-plan">${escapeHtml(agent.reflection)}</p>
        ${latestReflectionMemory(agent)}
      </section>

      <section>
        <h3>Relationships</h3>
        <ul class="compact-list">${relationshipList(agent)}</ul>
      </section>

      <section>
        <h3>Schedule</h3>
        <ul class="compact-list">${scheduleList(agent.schedule)}</ul>
      </section>

      <section>
        <h3>Daily Plan</h3>
        <ul class="compact-list">${dailyPlanList(agent)}</ul>
      </section>

      <section>
        <h3>Task Decomposition</h3>
        <ul class="compact-list">${taskDecompositionList(agent)}</ul>
      </section>

      <section>
        <h3>Recent Memories</h3>
        <ul class="compact-list memory-list">${memories || '<li>No memories yet.</li>'}</ul>
      </section>
    </div>
  `;
}

function characterAvatar(agent: Agent): string {
  const frame = resolveCharacterFrame(agent.appearance.frame);
  const col = frame % CHARACTER_SHEET_COLUMNS;
  const row = Math.floor(frame / CHARACTER_SHEET_COLUMNS);
  const backgroundX = -(col * CHARACTER_FRAME_STRIDE * CHARACTER_AVATAR_SCALE);
  const backgroundY = -(row * CHARACTER_FRAME_STRIDE * CHARACTER_AVATAR_SCALE);
  const backgroundWidth = 918 * CHARACTER_AVATAR_SCALE;
  const backgroundHeight = 203 * CHARACTER_AVATAR_SCALE;
  return `
    <span class="deduction-avatar" aria-hidden="true">
      <span style="background-image: url('${CHARACTER_SHEET_URL}'); background-size: ${backgroundWidth}px ${backgroundHeight}px; background-position: ${backgroundX}px ${backgroundY}px;"></span>
    </span>
  `;
}

function renderDeductionCandidate(agent: Agent, actionLabel: string): string {
  return `
    <button class="deduction-candidate-card" type="button" data-accuse-agent="${escapeHtml(agent.id)}">
      ${characterAvatar(agent)}
      <span class="deduction-candidate-copy">
        <strong>${escapeHtml(agent.name)}</strong>
        <small>${escapeHtml(agent.role)}</small>
      </span>
      <em>${escapeHtml(actionLabel)}</em>
    </button>
  `;
}

function tagLabel(tag: string): string {
  const labels: Record<string, string> = {
    roleGroundedMayorQuestion: 'role reason',
    repeatedMayorProbe: 'mayor probe',
    privateMayorProbe: 'private route',
    mayorMisdirection: 'possible misdirection',
    playerShapeshifterQuestion: 'player probe',
    mayorQuestion: 'mayor question',
    'npc-dialogue': 'NPC',
    'player-dialogue': 'Player',
  };
  return labels[tag] ?? tag;
}

function renderDeductionHistory(state: NonNullable<AgentSimulation['deduction']>): string {
  if (state.dialogueHistory.length === 0) {
    return '<p class="empty-state">No deduction dialogue recorded yet.</p>';
  }

  const grouped = new Map<number, typeof state.dialogueHistory>();
  for (const record of state.dialogueHistory) {
    grouped.set(record.day, [...(grouped.get(record.day) ?? []), record]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => b - a)
    .map(
      ([day, records]) => `
        <section class="history-day">
          <h3>Day ${day}</h3>
          ${records
            .map(
              (record) => `
                <article class="history-record">
                  <header>
                    <strong>${escapeHtml(record.timeLabel)} | ${escapeHtml(record.locationName)}</strong>
                    <span>${escapeHtml(record.speakerName)} -> ${escapeHtml(record.listenerName)}</span>
                  </header>
                  <p>${escapeHtml(record.topic)}</p>
                  <ul>${record.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
                  <div class="history-tags">${record.tags.map((tag) => `<span>${escapeHtml(tagLabel(tag))}</span>`).join('')}</div>
                </article>
              `,
            )
            .join('')}
        </section>
      `,
    )
    .join('');
}

function evidenceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    mayorQuestion: 'Mayor question',
    privateRouteProbe: 'Private route',
    roleGroundedReason: 'Role reason',
    mayorMisdirection: 'Misdirection',
    contradiction: 'Contradiction',
    playerProbe: 'Player probe',
    nightKill: 'Night kill',
    trustShift: 'Trust shift',
  };
  return labels[type] ?? type;
}

function renderDeductionEvidence(state: NonNullable<AgentSimulation['deduction']>): string {
  if (state.evidenceBoard.length === 0) {
    return '<p class="empty-state">No evidence cards yet. Talk to people or wait for NPC conversations.</p>';
  }

  const grouped = new Map<number, typeof state.evidenceBoard>();
  for (const clue of state.evidenceBoard) {
    grouped.set(clue.day, [...(grouped.get(clue.day) ?? []), clue]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => b - a)
    .map(
      ([day, clues]) => `
        <section class="evidence-day">
          <h3>Day ${day}</h3>
          <div class="evidence-grid">
            ${clues
              .map(
                (clue) => `
                  <article class="evidence-card ${clue.weight >= 4 ? 'is-strong' : ''}">
                    <header>
                      <strong>${escapeHtml(evidenceTypeLabel(clue.type))}</strong>
                      <span>${escapeHtml(clue.timeLabel)} | weight ${Math.round(clue.weight)}</span>
                    </header>
                    <p>${escapeHtml(clue.summary)}</p>
                    <div class="history-tags">
                      ${clue.privateToPlayer ? '<span>private</span>' : ''}
                      ${clue.forged && state.playerSide === 'shapeshifter' ? '<span>forged by you</span>' : ''}
                      ${clue.tags.slice(0, 5).map((tag) => `<span>${escapeHtml(tagLabel(tag))}</span>`).join('')}
                    </div>
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('');
}

function renderDeductionRecaps(state: NonNullable<AgentSimulation['deduction']>): string {
  if (state.dayRecaps.length === 0) {
    return '<p class="empty-state">No day recap yet. A recap is generated when night falls.</p>';
  }

  return state.dayRecaps
    .map(
      (recap) => `
        <article class="recap-card">
          <header>
            <strong>${escapeHtml(recap.title)}</strong>
            <span>${recap.dialogueCount} talks | ${recap.evidenceCount} clues</span>
          </header>
          <p>${escapeHtml(recap.summary)}</p>
          <p><strong>Top suspicion:</strong> ${escapeHtml(recap.topSuspicion ?? 'None')}</p>
          <p><strong>Requests:</strong> ${escapeHtml(recap.requestSummary ?? 'No request activity.')}</p>
          ${recap.nightOutcome ? `<p><strong>Night:</strong> ${escapeHtml(recap.nightOutcome)}</p>` : ''}
        </article>
      `,
    )
    .join('');
}

function renderVoteHints(state: NonNullable<AgentSimulation['deduction']>): string {
  if (state.npcVoteHints.length === 0) {
    return '<p class="vote-hint-empty">No strong town suspicion yet. Review dialogue history for weaker clues.</p>';
  }

  return `
    <section class="vote-hints">
      <h3>Town suspicion hints</h3>
      <ul>
        ${state.npcVoteHints
          .map(
            (hint) => `
              <li>
                <strong>${escapeHtml(hint.observerName)}</strong> suspects <strong>${escapeHtml(hint.targetName)}</strong>
                <span>${escapeHtml(hint.reason)}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    </section>
  `;
}

function renderShapeshifterSkills(
  state: NonNullable<AgentSimulation['deduction']>,
  aliveAgents: Agent[],
): string {
  if (state.playerSide !== 'shapeshifter' || state.phase !== 'day' || !state.shapeshifterSkills) {
    return '';
  }

  const targetOptions = aliveAgents
    .map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)} - ${escapeHtml(agent.role)}</option>`)
    .join('');
  const locationOptions = DEDUCTION_SKILL_LOCATIONS.map(
    (locationId) => `<option value="${locationId}">${escapeHtml(LOCATION_BY_ID[locationId].name)}</option>`,
  ).join('');
  const charges = state.shapeshifterSkills.charges;

  return `
    <section class="shapeshifter-skills" data-shapeshifter-skills>
      <h3>Shapeshifter Skills</h3>
      <label>
        Target
        <select data-shapeshifter-target>${targetOptions}</select>
      </label>
      <label>
        Lure location
        <select data-shapeshifter-location>${locationOptions}</select>
      </label>
      <div class="skill-buttons">
        <button type="button" data-shapeshifter-skill="listen">Listen (${charges.listen})</button>
        <button type="button" data-shapeshifter-skill="forge">Forge (${charges.forge})</button>
        <button type="button" data-shapeshifter-skill="lure">Lure (${charges.lure})</button>
      </div>
      <p>${escapeHtml(state.shapeshifterSkills.lastSkillMessage)}</p>
    </section>
  `;
}

interface HudSnapshots {
  controls: string;
  llm: string;
  debug: string;
  player: string;
  inventory: string;
  deduction: string;
  deductionHistory: string;
  deductionEvidence: string;
  deductionRecap: string;
  deductionResult: string;
  prompt: string;
  selectedAgent: string;
  eventLog: string;
  dialoguePanel: string;
  dialogueOptions: string;
  perf: string;
}

const EMPTY_SNAPSHOTS: HudSnapshots = {
  controls: '',
  llm: '',
  debug: '',
  player: '',
  inventory: '',
  deduction: '',
  deductionHistory: '',
  deductionEvidence: '',
  deductionRecap: '',
  deductionResult: '',
  prompt: '',
  selectedAgent: '',
  eventLog: '',
  dialoguePanel: '',
  dialogueOptions: '',
  perf: '',
};

function memorySnapshot(memories: Agent['memories']): string {
  return memories.map((memory) => `${memory.id}:${memory.type}:${memory.importance}:${memory.summary}`).join('|');
}

function selectedAgentSnapshot(agent?: Agent): string {
  if (!agent) {
    return 'none';
  }

  return [
    agent.id,
    agent.name,
    agent.role,
    agent.personality,
    agent.currentGoal,
    agent.currentAction,
    agent.reason,
    agent.destination,
    agent.mobility,
    agent.homeLocationId ?? '',
    agent.tradeProfile?.displayName ?? '',
    agent.emoteState ? `${agent.emoteState.kind}:${agent.emoteState.message ?? ''}:${agent.emoteState.expiresAtMs ?? 'persist'}` : '',
    agent.pendingMessage ? `${agent.pendingMessage.text}:${agent.pendingMessage.createdAtMinutes}` : '',
    agent.relationshipDeltaReason ?? '',
    agent.lastLLMDecision,
    agent.pathStatus,
    agent.lastObservation,
    agent.lastPlan,
    agent.lastAction,
    agent.lastMemory,
    agent.nextPlan,
    agent.reflection,
    agent.mood,
    Math.round(agent.needs.energy),
    Math.round(agent.needs.social),
    Math.round(agent.needs.hunger),
    agent.dailyPlan.map((entry) => `${entry.startMinutes}:${entry.locationId}:${entry.action}`).join('|'),
    agent.currentTaskDecomposition.map((entry) => `${entry.durationMinutes}:${entry.action}`).join('|'),
    memorySnapshot(agent.memories.slice(0, 5)),
    memorySnapshot(agent.retrievedMemories),
    JSON.stringify(agent.relationships),
  ].join('::');
}

function playerSnapshot(player: PlayerState): string {
  const location = findLocationAt(player.position)?.id ?? 'path';
  return [
    player.profile.name,
    player.profile.gender,
    player.profile.role,
    player.profile.personalityTags.join(','),
    player.profile.objective,
    location,
    player.profile.appearance.presetId,
    player.profile.appearance.tint ?? '',
    player.profile.appearance.skinTone ?? '',
    player.profile.appearance.hairStyle ?? '',
    player.profile.appearance.outfitColor ?? '',
    Math.round(player.stats.energy),
    Math.round(player.stats.social),
    Math.round(player.stats.hunger),
    Math.round(player.stats.reputation),
    Math.round(player.stats.curiosity),
    player.quest.talkedNpcIds.join(','),
    player.quest.invitedNpcIds.join(','),
    player.quest.completed ? 1 : 0,
    player.quest.completionMessage ?? '',
    player.requests.map((request) => `${request.id}:${request.status}:${request.progress}/${request.required}`).join('|'),
  ].join('::');
}

export class HudController {
  private readonly timeReadout = getElement<HTMLSpanElement>('virtual-time');
  private readonly pauseButton = getElement<HTMLButtonElement>('pause-button');
  private readonly speedButton = getElement<HTMLButtonElement>('speed-button');
  private readonly resetButton = getElement<HTMLButtonElement>('reset-button');
  private readonly demoEventButton = getElement<HTMLButtonElement>('demo-event-button');
  private readonly fastForwardButton = getElement<HTMLButtonElement>('fast-forward-button');
  private readonly llmMode = getElement<HTMLSpanElement>('llm-mode');
  private readonly llmLastCall = getElement<HTMLSpanElement>('llm-last-call');
  private readonly llmLatency = getElement<HTMLSpanElement>('llm-latency');
  private readonly llmPromptType = getElement<HTMLSpanElement>('llm-prompt-type');
  private readonly perfSummary = getElement<HTMLSpanElement>('perf-summary');
  private readonly llmLastResult = getElement<HTMLSpanElement>('llm-last-result');
  private readonly llmLastFailure = getElement<HTMLSpanElement>('llm-last-failure');
  private readonly llmCallCounts = getElement<HTMLSpanElement>('llm-call-counts');
  private readonly llmFallbackCount = getElement<HTMLSpanElement>('llm-fallback-count');
  private readonly llmRetryButton = getElement<HTMLButtonElement>('llm-retry-button');
  private readonly llmTestButton = getElement<HTMLButtonElement>('llm-test-button');
  private readonly showGrid = getElement<HTMLInputElement>('show-grid');
  private readonly showObstacles = getElement<HTMLInputElement>('show-obstacles');
  private readonly showPath = getElement<HTMLInputElement>('show-path');
  private readonly agentPanel = getElement<HTMLElement>('agent-panel');
  private readonly agentPanelClose = getElement<HTMLButtonElement>('agent-panel-close');
  private readonly agentDetails = getElement<HTMLDivElement>('agent-details');
  private readonly eventLog = getElement<HTMLDivElement>('event-log');
  private readonly eventForm = getElement<HTMLFormElement>('event-form');
  private readonly eventInput = getElement<HTMLInputElement>('event-input');
  private readonly playerHud = getElement<HTMLElement>('player-hud');
  private readonly inventoryPanel = getElement<HTMLElement>('inventory-panel');
  private readonly inventoryClose = getElement<HTMLButtonElement>('inventory-close');
  private readonly inventoryGold = getElement<HTMLElement>('inventory-gold');
  private readonly inventoryGrid = getElement<HTMLDivElement>('inventory-grid');
  private readonly playerCreator = getElement<HTMLElement>('player-creator');
  private readonly playerForm = getElement<HTMLFormElement>('player-form');
  private readonly playerName = getElement<HTMLInputElement>('player-name');
  private readonly gameMode = getElement<HTMLSelectElement>('game-mode');
  private readonly deductionNpcCount = getElement<HTMLInputElement>('deduction-npc-count');
  private readonly deductionShapeshifterCount = getElement<HTMLInputElement>('deduction-shapeshifter-count');
  private readonly playerGender = getElement<HTMLSelectElement>('player-gender');
  private readonly playerRole = getElement<HTMLSelectElement>('player-role');
  private readonly playerSpawn = getElement<HTMLSelectElement>('player-spawn');
  private readonly playerTags = getElement<HTMLInputElement>('player-tags');
  private readonly playerObjective = getElement<HTMLInputElement>('player-objective');
  private readonly playerEnergy = getElement<HTMLInputElement>('player-energy');
  private readonly playerSocial = getElement<HTMLInputElement>('player-social');
  private readonly playerHunger = getElement<HTMLInputElement>('player-hunger');
  private readonly playerReputation = getElement<HTMLInputElement>('player-reputation');
  private readonly playerCuriosity = getElement<HTMLInputElement>('player-curiosity');
  private readonly playerAppearance = getElement<HTMLSelectElement>('player-appearance');
  private readonly playerSkinTone = getElement<HTMLSelectElement>('player-skin-tone');
  private readonly playerHairStyle = getElement<HTMLSelectElement>('player-hair-style');
  private readonly playerOutfitColor = getElement<HTMLSelectElement>('player-outfit-color');
  private readonly apiProvider = getElement<HTMLSelectElement>('api-provider');
  private readonly apiKey = getElement<HTMLInputElement>('api-key');
  private readonly apiBaseUrl = getElement<HTMLInputElement>('api-base-url');
  private readonly apiModel = getElement<HTMLInputElement>('api-model');
  private readonly apiUseFallback = getElement<HTMLInputElement>('api-use-fallback');
  private readonly toggleApiKey = getElement<HTMLButtonElement>('toggle-api-key');
  private readonly interactionPrompt = getElement<HTMLDivElement>('interaction-prompt');
  private readonly deductionPanel = getElement<HTMLElement>('deduction-panel');
  private readonly deductionPhase = getElement<HTMLElement>('deduction-phase');
  private readonly deductionSummary = getElement<HTMLParagraphElement>('deduction-summary');
  private readonly deductionActions = getElement<HTMLDivElement>('deduction-actions');
  private readonly deductionHistoryPanel = getElement<HTMLElement>('deduction-history-panel');
  private readonly deductionHistoryClose = getElement<HTMLButtonElement>('deduction-history-close');
  private readonly deductionHistoryBody = getElement<HTMLDivElement>('deduction-history-body');
  private readonly deductionEvidencePanel = getElement<HTMLElement>('deduction-evidence-panel');
  private readonly deductionEvidenceTitle = getElement<HTMLHeadingElement>('deduction-evidence-title');
  private readonly deductionEvidenceClose = getElement<HTMLButtonElement>('deduction-evidence-close');
  private readonly deductionEvidenceBody = getElement<HTMLDivElement>('deduction-evidence-body');
  private readonly deductionRecapPanel = getElement<HTMLElement>('deduction-recap-panel');
  private readonly deductionRecapClose = getElement<HTMLButtonElement>('deduction-recap-close');
  private readonly deductionRecapBody = getElement<HTMLDivElement>('deduction-recap-body');
  private readonly deductionResultOverlay = getElement<HTMLDivElement>('deduction-result-overlay');
  private readonly dialoguePanel = getElement<HTMLElement>('dialogue-panel');
  private readonly dialogueTitle = getElement<HTMLHeadingElement>('dialogue-title');
  private readonly dialogueLine = getElement<HTMLParagraphElement>('dialogue-line');
  private readonly dialogueOptions = getElement<HTMLDivElement>('dialogue-options');
  private readonly dialogueForm = getElement<HTMLFormElement>('dialogue-form');
  private readonly dialogueInput = getElement<HTMLInputElement>('dialogue-input');
  private readonly dialogueClose = getElement<HTMLButtonElement>('dialogue-close');
  private deductionHistoryOpen = false;
  private deductionEvidenceOpen = false;
  private deductionRecapOpen = false;
  private snapshots: HudSnapshots = { ...EMPTY_SNAPSHOTS };

  constructor(
    private readonly simulation: AgentSimulation,
    private readonly performanceMonitor?: PerformanceMonitor,
  ) {
    this.restoreStoredLLMConfig();
    stopGameHotkeysDuringTextEntry();
    this.installPanelToggles();

    this.pauseButton.addEventListener('click', () => {
      this.simulation.togglePaused();
      this.update(true);
    });

    this.speedButton.addEventListener('click', () => {
      this.simulation.cycleSpeed();
      this.update(true);
    });

    this.resetButton.addEventListener('click', () => {
      this.simulation.reset();
      this.update(true);
    });

    this.demoEventButton.addEventListener('click', () => {
      this.simulation.triggerDemoEvent();
      this.update(true);
    });

    this.fastForwardButton.addEventListener('click', () => {
      this.simulation.fastForwardToDemoEventLead();
      this.update(true);
    });

    this.agentPanelClose.addEventListener('click', () => {
      this.simulation.clearSelectedAgent();
      this.update(true);
    });

    this.inventoryClose.addEventListener('click', () => {
      this.simulation.closeInventory();
      this.resetGameplayKeys();
      this.update(true);
    });

    this.llmRetryButton.addEventListener('click', () => {
      this.simulation.retryLLM();
      this.update(true);
    });

    this.llmTestButton.addEventListener('click', () => {
      this.simulation.testLLM(this.readLLMConfigFromForm());
      this.update(true);
    });

    this.playerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.simulation.configureLLM(this.readLLMConfigFromForm());
      this.simulation.createPlayer({
        name: this.playerName.value,
        gameMode: this.gameMode.value as GameMode,
        deductionConfig: {
          npcCount: Number(this.deductionNpcCount.value),
          shapeshifterCount: Number(this.deductionShapeshifterCount.value),
        },
        gender: this.playerGender.value as PlayerGender,
        role: this.playerRole.value as PlayerRole,
        spawnLocation: this.playerSpawn.value as LocationId,
        personalityTags: this.playerTags.value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        objective: this.playerObjective.value,
        appearance: makeAppearance(this.playerAppearance.value, {
          skinTone: this.playerSkinTone.value,
          hairStyle: this.playerHairStyle.value,
          outfitColor: this.playerOutfitColor.value,
          tint: OUTFIT_TINTS[this.playerOutfitColor.value],
        }),
        stats: {
          energy: Number(this.playerEnergy.value),
          social: Number(this.playerSocial.value),
          hunger: Number(this.playerHunger.value),
          reputation: Number(this.playerReputation.value),
          curiosity: Number(this.playerCuriosity.value),
        },
      });
      this.playerCreator.classList.add('hidden');
      this.resetGameplayKeys();
      this.update(true);
    });

    this.apiProvider.addEventListener('change', () => {
      this.applyProviderDefaults(this.apiProvider.value as LLMProvider);
    });

    this.toggleApiKey.addEventListener('click', () => {
      const show = this.apiKey.type === 'password';
      this.apiKey.type = show ? 'text' : 'password';
      setText(this.toggleApiKey, show ? 'Hide' : 'Show');
    });

    this.dialogueClose.addEventListener('click', () => {
      this.simulation.closePlayerDialogue();
      this.resetGameplayKeys();
      this.update(true);
    });

    this.dialogueForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = this.dialogueInput.value.trim();
      if (!message) {
        return;
      }

      this.simulation.handlePlayerDialogue(undefined, message);
      this.dialogueInput.value = '';
      this.resetGameplayKeys();
      this.update(true);
    });

    this.dialogueOptions.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest<HTMLButtonElement>('button[data-dialogue-option]');
      const tradeButton = target.closest<HTMLButtonElement>('button[data-trade-agent]');
      if (tradeButton?.dataset.tradeAgent) {
        const result = this.simulation.openTrade(tradeButton.dataset.tradeAgent);
        if (result.ok) {
          this.dialogueInput.value = '';
        }
        this.update(true);
        return;
      }

      if (!button?.dataset.dialogueOption) {
        return;
      }

      this.simulation.handlePlayerDialogue(button.dataset.dialogueOption as PlayerDialogueOptionId);
      this.resetGameplayKeys();
      this.update(true);
    });

    this.deductionActions.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const historyButton = target.closest<HTMLButtonElement>('button[data-deduction-history]');
      if (historyButton) {
        this.deductionHistoryOpen = true;
        this.resetGameplayKeys();
        this.update(true);
        return;
      }

      const evidenceButton = target.closest<HTMLButtonElement>('button[data-deduction-evidence]');
      if (evidenceButton) {
        this.deductionEvidenceOpen = true;
        this.resetGameplayKeys();
        this.update(true);
        return;
      }

      const recapButton = target.closest<HTMLButtonElement>('button[data-deduction-recap]');
      if (recapButton) {
        this.deductionRecapOpen = true;
        this.resetGameplayKeys();
        this.update(true);
        return;
      }

      const skillButton = target.closest<HTMLButtonElement>('button[data-shapeshifter-skill]');
      if (skillButton?.dataset.shapeshifterSkill) {
        const skillRoot = skillButton.closest<HTMLElement>('[data-shapeshifter-skills]');
        const targetId = skillRoot?.querySelector<HTMLSelectElement>('[data-shapeshifter-target]')?.value;
        const locationId = skillRoot?.querySelector<HTMLSelectElement>('[data-shapeshifter-location]')?.value as LocationId | undefined;
        this.simulation.useShapeshifterSkill(skillButton.dataset.shapeshifterSkill as ShapeshifterSkillId, {
          targetAgentId: targetId,
          locationId,
        });
        this.resetGameplayKeys();
        this.update(true);
        return;
      }

      const accuseButton = target.closest<HTMLButtonElement>('button[data-accuse-agent]');
      if (accuseButton?.dataset.accuseAgent) {
        this.simulation.chooseDeductionNightTarget(accuseButton.dataset.accuseAgent);
        this.resetGameplayKeys();
        this.update(true);
        return;
      }

      const continueButton = target.closest<HTMLButtonElement>('button[data-deduction-continue]');
      if (continueButton) {
        this.simulation.continueDeductionRound();
        this.resetGameplayKeys();
        this.update(true);
      }
    });

    this.deductionHistoryClose.addEventListener('click', () => {
      this.deductionHistoryOpen = false;
      this.resetGameplayKeys();
      this.update(true);
    });

    this.deductionEvidenceClose.addEventListener('click', () => {
      this.deductionEvidenceOpen = false;
      this.resetGameplayKeys();
      this.update(true);
    });

    this.deductionRecapClose.addEventListener('click', () => {
      this.deductionRecapOpen = false;
      this.resetGameplayKeys();
      this.update(true);
    });

    this.showGrid.addEventListener('change', () => {
      this.simulation.setDebugFlag('showGrid', this.showGrid.checked);
      this.update(true);
    });

    this.showObstacles.addEventListener('change', () => {
      this.simulation.setDebugFlag('showObstacles', this.showObstacles.checked);
      this.update(true);
    });

    this.showPath.addEventListener('change', () => {
      this.simulation.setDebugFlag('showPath', this.showPath.checked);
      this.update(true);
    });

    this.eventForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = this.eventInput.value.trim();
      if (!message) {
        return;
      }

      this.simulation.addPlayerEvent(message);
      this.eventInput.value = '';
      this.resetGameplayKeys();
      this.update(true);
    });
  }

  private restoreStoredLLMConfig(): void {
    const raw = window.localStorage.getItem('aivilization.llmConfig');
    if (!raw) {
      return;
    }

    try {
      const config = JSON.parse(raw) as LLMRuntimeConfig;
      this.apiProvider.value = config.provider;
      this.apiKey.value = config.apiKey;
      this.apiBaseUrl.value =
        config.provider === 'deepseek' ? config.baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '') : config.baseUrl;
      this.apiModel.value = config.model;
      this.apiUseFallback.checked = config.useFallback;
    } catch {
      window.localStorage.removeItem('aivilization.llmConfig');
    }
  }

  private applyProviderDefaults(provider: LLMProvider): void {
    const defaults = PROVIDER_DEFAULTS[provider];
    if (provider !== 'custom') {
      this.apiBaseUrl.value = defaults.baseUrl;
      this.apiModel.value = defaults.model;
      return;
    }

    if (!this.apiBaseUrl.value || Object.values(PROVIDER_DEFAULTS).some((entry) => entry.baseUrl === this.apiBaseUrl.value)) {
      this.apiBaseUrl.value = defaults.baseUrl;
    }
    if (!this.apiModel.value || Object.values(PROVIDER_DEFAULTS).some((entry) => entry.model === this.apiModel.value)) {
      this.apiModel.value = defaults.model;
    }
  }

  private readLLMConfigFromForm(): LLMRuntimeConfig | undefined {
    const apiKey = this.apiKey.value.trim();
    const baseUrl = this.apiBaseUrl.value.trim();
    const model = this.apiModel.value.trim();
    if (!apiKey || !baseUrl || !model) {
      return undefined;
    }

    return {
      provider: this.apiProvider.value as LLMProvider,
      apiKey,
      baseUrl:
        this.apiProvider.value === 'deepseek'
          ? baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
          : baseUrl.replace(/\/+$/, ''),
      model,
      useFallback: this.apiUseFallback.checked,
    };
  }

  private resetGameplayKeys(): void {
    window.dispatchEvent(new CustomEvent('aivilization:reset-game-keys'));
  }

  update(force = false): boolean {
    const startedAt = performance.now();
    let changed = false;

    try {
      changed = this.updateControls(force) || changed;
      changed = this.updateLLMStatus(force) || changed;
      changed = this.updateDebugControls(force) || changed;
      changed = this.updatePlayerHud(force) || changed;
      changed = this.updateInventoryPanel(force) || changed;
      changed = this.updateDeductionPanel(force) || changed;
      changed = this.updateDeductionHistoryPanel(force) || changed;
      changed = this.updateDeductionEvidencePanel(force) || changed;
      changed = this.updateDeductionRecapPanel(force) || changed;
      changed = this.updateDeductionResultOverlay(force) || changed;
      changed = this.updatePrompt(force) || changed;
      changed = this.updateDialoguePanel(force) || changed;
      changed = this.updateAgentDetails(force) || changed;
      changed = this.updateEventLog(force) || changed;
      changed = this.updatePerformanceSummary(force) || changed;
      return changed;
    } finally {
      this.performanceMonitor?.recordHud(performance.now() - startedAt);
    }
  }

  private updateControls(force: boolean): boolean {
    const snapshot = `${this.simulation.timeLabel}:${this.simulation.paused ? 1 : 0}:${this.simulation.timeScale}`;
    if (!force && snapshot === this.snapshots.controls) {
      return false;
    }

    this.snapshots.controls = snapshot;
    setText(this.timeReadout, this.simulation.timeLabel);
    setText(this.pauseButton, this.simulation.paused ? 'Continue' : 'Pause');
    setText(this.speedButton, `Speed ${this.simulation.timeScale}x`);
    return true;
  }

  private updateLLMStatus(force: boolean): boolean {
    const status = this.simulation.llmStatus;
    const snapshot = [
      status.mode,
      status.lastCall,
      status.lastLatencyMs,
      status.lastPromptType,
      status.lastResultSummary,
      status.lastFailureReason,
      status.callCounts.plan,
      status.callCounts.dialogue,
      status.callCounts.reflection,
      status.fallbackCount,
    ].join('::');

    if (!force && snapshot === this.snapshots.llm) {
      return false;
    }

    this.snapshots.llm = snapshot;
    setText(this.llmMode, status.mode);
    setText(this.llmLastCall, status.lastCall);
    setText(this.llmLatency, `${status.lastLatencyMs}ms`);
    setText(this.llmPromptType, status.lastPromptType);
    setText(this.llmLastResult, status.lastResultSummary);
    setText(this.llmLastFailure, status.lastFailureReason || 'None');
    setText(
      this.llmCallCounts,
      `plan ${status.callCounts.plan} / dialogue ${status.callCounts.dialogue} / reflection ${status.callCounts.reflection}`,
    );
    setText(this.llmFallbackCount, String(status.fallbackCount));
    return true;
  }

  private updateDebugControls(force: boolean): boolean {
    const snapshot = `${this.simulation.debug.showGrid}:${this.simulation.debug.showObstacles}:${this.simulation.debug.showPath}`;
    if (!force && snapshot === this.snapshots.debug) {
      return false;
    }

    this.snapshots.debug = snapshot;
    this.showGrid.checked = this.simulation.debug.showGrid;
    this.showObstacles.checked = this.simulation.debug.showObstacles;
    this.showPath.checked = this.simulation.debug.showPath;
    return true;
  }

  private updatePlayerHud(force: boolean): boolean {
    if (!this.simulation.started) {
      const snapshot = 'not-started';
      if (!force && snapshot === this.snapshots.player) {
        return false;
      }

      this.snapshots.player = snapshot;
      this.playerHud.classList.add('hidden');
      return true;
    }

    const snapshot = `${playerSnapshot(this.simulation.player)}:${this.simulation.agents.length}`;
    if (!force && snapshot === this.snapshots.player) {
      return false;
    }

    this.snapshots.player = snapshot;
    this.playerHud.classList.remove('hidden');
    this.playerHud.innerHTML = renderPlayerHud(this.simulation.player, this.simulation.agents.length);
    return true;
  }

  private updateInventoryPanel(force: boolean): boolean {
    const player = this.simulation.player;
    const snapshot = [
      this.simulation.started ? 1 : 0,
      this.simulation.inventoryOpen ? 1 : 0,
      player.gold,
      player.inventory.map((item) => `${item.id}:${item.quantity}`).join('|'),
    ].join('::');

    if (!force && snapshot === this.snapshots.inventory) {
      return false;
    }

    this.snapshots.inventory = snapshot;
    this.inventoryPanel.classList.toggle('hidden', !this.simulation.started || !this.simulation.inventoryOpen);
    setText(this.inventoryGold, String(player.gold));
    this.inventoryGrid.innerHTML = renderInventoryGrid(player);
    return true;
  }

  private updateDeductionPanel(force: boolean): boolean {
    const state = this.simulation.deduction;
    if (!state) {
      const snapshot = 'hidden';
      if (!force && snapshot === this.snapshots.deduction) {
        return false;
      }

      this.snapshots.deduction = snapshot;
      this.deductionPanel.classList.add('hidden');
      this.deductionPanel.classList.remove('is-night');
      this.deductionHistoryPanel.classList.add('hidden');
      this.deductionEvidencePanel.classList.add('hidden');
      this.deductionRecapPanel.classList.add('hidden');
      this.deductionResultOverlay.classList.add('hidden');
      this.deductionHistoryOpen = false;
      this.deductionEvidenceOpen = false;
      this.deductionRecapOpen = false;
      document.body.classList.remove('deduction-night');
      return true;
    }

    const aliveAgents = this.simulation.deductionAliveAgents;
    const snapshot = [
      state.phase,
      state.day,
      state.playerDialoguesUsed,
      state.playerDialogueLimit,
      state.aliveAgentIds.join(','),
      state.shapeshifterIds.length,
      state.nightMessage,
      state.playerSide,
      state.playerSuspicion,
      state.dialogueHistory.length,
      state.evidenceBoard.length,
      state.dayRecaps.map((recap) => `${recap.id}:${recap.nightOutcome ?? ''}:${recap.evidenceCount}:${recap.dialogueCount}`).join(','),
      state.npcVoteHints.map((hint) => `${hint.id}:${Math.round(hint.score)}`).join(','),
      state.shapeshifterSkills
        ? `${state.shapeshifterSkills.charges.listen},${state.shapeshifterSkills.charges.forge},${state.shapeshifterSkills.charges.lure}:${state.shapeshifterSkills.lastSkillMessage}`
        : '',
      state.resultOverlay ?? '',
      state.winner ?? '',
    ].join('::');

    if (!force && snapshot === this.snapshots.deduction) {
      return false;
    }

    this.snapshots.deduction = snapshot;
    this.deductionPanel.classList.remove('hidden');
    const isNightPhase = state.phase === 'nightAccuse' || state.phase === 'nightResult' || state.phase === 'ended';
    this.deductionPanel.classList.toggle('is-night', isNightPhase);
    document.body.classList.toggle('deduction-night', isNightPhase);
    const phaseLabel =
      state.phase === 'day'
        ? `Day ${state.day}`
        : state.phase === 'nightAccuse'
          ? `Night ${state.day}`
          : state.phase === 'nightResult'
            ? 'Night Result'
            : state.winner === 'player'
              ? 'Victory'
              : 'Defeat';
    setText(this.deductionPhase, phaseLabel);
    const questionsRemaining = state.playerDialogueLimit - state.playerDialoguesUsed;
    setText(
      this.deductionSummary,
      state.phase === 'day'
        ? state.playerSide === 'shapeshifter'
          ? `Find the hidden mayor | Questions ${questionsRemaining}/${state.playerDialogueLimit} | Alive ${state.aliveAgentIds.length} | Suspicion ${state.playerSuspicion}/100`
          : `Mayor: ${this.simulation.deductionMayorName} | Questions ${questionsRemaining}/${state.playerDialogueLimit} | Alive ${state.aliveAgentIds.length} | Shapeshifters left ${state.shapeshifterIds.length}`
        : state.nightMessage,
    );

    if (state.phase === 'nightAccuse') {
      const actionLabel = state.playerSide === 'shapeshifter' ? 'Kill' : 'Accuse';
      this.deductionActions.innerHTML = `
        <div class="deduction-modal-tools">
          <button type="button" data-deduction-history>Dialogue History</button>
          <button type="button" data-deduction-evidence>${state.playerSide === 'shapeshifter' ? 'Town Notes' : 'Evidence Board'}</button>
          <button type="button" data-deduction-recap>Day Recap</button>
        </div>
        ${renderVoteHints(state)}
        <div class="accuse-grid">
          ${aliveAgents
            .map((agent) => renderDeductionCandidate(agent, actionLabel))
            .join('')}
        </div>
      `;
      return true;
    }

    if (state.phase === 'nightResult') {
      this.deductionActions.innerHTML = `
        <div class="deduction-modal-tools">
          <button type="button" data-deduction-history>Dialogue History</button>
          <button type="button" data-deduction-evidence>${state.playerSide === 'shapeshifter' ? 'Town Notes' : 'Evidence Board'}</button>
          <button type="button" data-deduction-recap>Day Recap</button>
          <button type="button" data-deduction-continue>Continue to next day</button>
        </div>
        ${renderVoteHints(state)}
      `;
      return true;
    }

    if (state.phase === 'ended') {
      this.deductionActions.innerHTML = `
        <div class="deduction-modal-tools">
          <button type="button" data-deduction-history>Dialogue History</button>
          <button type="button" data-deduction-evidence>${state.playerSide === 'shapeshifter' ? 'Town Notes' : 'Evidence Board'}</button>
          <button type="button" data-deduction-recap>Day Recap</button>
        </div>
        <p class="deduction-end-note">Use Reset or create a new player to start another run.</p>
      `;
      return true;
    }

    this.deductionActions.innerHTML = `
      <div class="deduction-modal-tools">
        <button type="button" data-deduction-history>Dialogue History</button>
        <button type="button" data-deduction-evidence>${state.playerSide === 'shapeshifter' ? 'Town Notes' : 'Evidence Board'}</button>
        <button type="button" data-deduction-recap>Day Recap</button>
      </div>
      ${renderShapeshifterSkills(state, aliveAgents)}
      <p>Alive: ${aliveAgents.map((agent) => escapeHtml(agent.name)).join(', ')}</p>
    `;
    return true;
  }

  private updateDeductionHistoryPanel(force: boolean): boolean {
    const state = this.simulation.deduction;
    const snapshot = state
      ? `${this.deductionHistoryOpen ? 1 : 0}:${state.dialogueHistory.map((record) => `${record.id}:${record.tags.join(',')}`).join('|')}`
      : 'hidden';
    if (!force && snapshot === this.snapshots.deductionHistory) {
      return false;
    }

    this.snapshots.deductionHistory = snapshot;
    this.deductionHistoryPanel.classList.toggle('hidden', !state || !this.deductionHistoryOpen);
    this.deductionHistoryBody.innerHTML = state ? renderDeductionHistory(state) : '';
    return true;
  }

  private updateDeductionEvidencePanel(force: boolean): boolean {
    const state = this.simulation.deduction;
    const snapshot = state
      ? `${this.deductionEvidenceOpen ? 1 : 0}:${state.playerSide}:${state.evidenceBoard
          .map((clue) => `${clue.id}:${clue.weight}:${clue.tags.join(',')}`)
          .join('|')}`
      : 'hidden';
    if (!force && snapshot === this.snapshots.deductionEvidence) {
      return false;
    }

    this.snapshots.deductionEvidence = snapshot;
    this.deductionEvidencePanel.classList.toggle('hidden', !state || !this.deductionEvidenceOpen);
    if (state) {
      setText(this.deductionEvidenceTitle, state.playerSide === 'shapeshifter' ? 'Town Notes' : 'Evidence Board');
      this.deductionEvidenceBody.innerHTML = renderDeductionEvidence(state);
    } else {
      this.deductionEvidenceBody.innerHTML = '';
    }
    return true;
  }

  private updateDeductionRecapPanel(force: boolean): boolean {
    const state = this.simulation.deduction;
    const snapshot = state
      ? `${this.deductionRecapOpen ? 1 : 0}:${state.dayRecaps
          .map((recap) => `${recap.id}:${recap.nightOutcome ?? ''}:${recap.evidenceCount}:${recap.dialogueCount}`)
          .join('|')}`
      : 'hidden';
    if (!force && snapshot === this.snapshots.deductionRecap) {
      return false;
    }

    this.snapshots.deductionRecap = snapshot;
    this.deductionRecapPanel.classList.toggle('hidden', !state || !this.deductionRecapOpen);
    this.deductionRecapBody.innerHTML = state ? renderDeductionRecaps(state) : '';
    return true;
  }

  private updateDeductionResultOverlay(force: boolean): boolean {
    const state = this.simulation.deduction;
    const overlay = state?.resultOverlay;
    const snapshot = `${overlay ?? 'hidden'}:${state?.nightMessage ?? ''}`;
    if (!force && snapshot === this.snapshots.deductionResult) {
      return false;
    }

    this.snapshots.deductionResult = snapshot;
    this.deductionResultOverlay.classList.toggle('hidden', !overlay);
    this.deductionResultOverlay.classList.toggle('is-win', overlay === 'win');
    this.deductionResultOverlay.classList.toggle('is-lose', overlay === 'lose');
    setText(this.deductionResultOverlay, overlay === 'win' ? 'Win' : overlay === 'lose' ? 'Lose' : '');
    return true;
  }

  private updateAgentDetails(force: boolean): boolean {
    const selectedAgent = this.simulation.selectedAgent;
    const snapshot = selectedAgentSnapshot(selectedAgent);
    if (!force && snapshot === this.snapshots.selectedAgent) {
      return false;
    }

    this.snapshots.selectedAgent = snapshot;
    this.agentPanel.classList.toggle('is-open', Boolean(selectedAgent));
    this.agentDetails.innerHTML = selectedAgent
      ? renderAgent(selectedAgent)
      : '<div class="empty-state">Click an NPC to inspect goals, needs, schedule, and recent memories.</div>';
    return true;
  }

  private updateEventLog(force: boolean): boolean {
    const logs = this.simulation.logs.slice(0, 30);
    const snapshot = logs.map((log) => `${log.id}:${log.time}:${log.message}`).join('|');
    if (!force && snapshot === this.snapshots.eventLog) {
      return false;
    }

    this.snapshots.eventLog = snapshot;
    this.eventLog.innerHTML = logs
      .map((log) => `<article><time>${log.time}</time><p>${escapeHtml(log.message)}</p></article>`)
      .join('');
    return true;
  }

  private updatePerformanceSummary(force: boolean): boolean {
    const summary = this.performanceMonitor?.formatSummary() ?? 'Perf unavailable';
    const version = this.performanceMonitor?.getSnapshot().version ?? 0;
    const snapshot = `${version}:${summary}`;
    if (!force && snapshot === this.snapshots.perf) {
      return false;
    }

    this.snapshots.perf = snapshot;
    setText(this.perfSummary, summary);
    return true;
  }

  private updatePrompt(force: boolean): boolean {
    if (this.simulation.deduction && this.simulation.deduction.phase !== 'day') {
      const text =
        this.simulation.deduction.phase === 'nightAccuse'
          ? this.simulation.deduction.playerSide === 'shapeshifter'
            ? 'Night phase: choose a victim in the centered Deduction panel.'
            : 'Night phase: choose a suspect in the centered Deduction panel.'
          : this.simulation.deduction.nightMessage;
      const snapshot = `deduction:${this.simulation.deduction.phase}:${text}`;
      if (!force && snapshot === this.snapshots.prompt) {
        return false;
      }

      this.snapshots.prompt = snapshot;
      setText(this.interactionPrompt, text);
      this.interactionPrompt.classList.add('is-actionable');
      return true;
    }

    const hint = this.simulation.player.interactionHint;
    const shouldShow = hint.kind !== 'none' && !this.simulation.player.dialogue;
    const text = shouldShow ? hint.label : 'WASD move | Shift run | E interact | B inventory | Right-drag / wheel to inspect map';
    const snapshot = `${shouldShow ? 1 : 0}:${text}`;
    if (!force && snapshot === this.snapshots.prompt) {
      return false;
    }

    this.snapshots.prompt = snapshot;
    setText(this.interactionPrompt, text);
    this.interactionPrompt.classList.toggle('is-actionable', shouldShow);
    return true;
  }

  private updateDialoguePanel(force: boolean): boolean {
    const dialogue = this.simulation.player.dialogue;
    if (!dialogue) {
      const snapshot = 'closed';
      if (!force && snapshot === this.snapshots.dialoguePanel) {
        return false;
      }

      this.snapshots.dialoguePanel = snapshot;
      this.snapshots.dialogueOptions = '';
      this.dialoguePanel.classList.add('hidden');
      return true;
    }

    const agent = this.simulation.agents.find((candidate) => candidate.id === dialogue.npcId);
    const wasHidden = this.dialoguePanel.classList.contains('hidden');
    this.dialoguePanel.classList.remove('hidden');
    this.ensurePanelToggle(this.dialoguePanel, 'Dialogue');
    const title = agent ? `Talking with ${agent.name}` : 'Dialogue';
    const panelSnapshot = [
      dialogue.npcId,
      title,
      dialogue.npcLine,
      dialogue.playerIntent,
      dialogue.npcIntent,
      dialogue.awaitingLLM ? 1 : 0,
    ].join('::');
    let changed = false;

    if (force || panelSnapshot !== this.snapshots.dialoguePanel) {
      this.snapshots.dialoguePanel = panelSnapshot;
      setText(this.dialogueTitle, title);
      setText(this.dialogueLine, dialogue.npcLine);
      this.dialogueInput.disabled = dialogue.awaitingLLM;
      if (wasHidden && !dialogue.awaitingLLM) {
        window.requestAnimationFrame(() => this.dialogueInput.focus());
      }
      changed = true;
    }

    const optionsSnapshot = dialogue.options
      .map((option) => `${option.id}:${option.label}:${dialogue.awaitingLLM ? 1 : 0}`)
      .join('|') + `::trade:${agent?.tradeProfile?.enabled ? 1 : 0}`;
    if (force || optionsSnapshot !== this.snapshots.dialogueOptions) {
      this.snapshots.dialogueOptions = optionsSnapshot;
      const optionButtons = dialogue.options
        .map(
          (option) =>
            `<button type="button" data-dialogue-option="${option.id}" ${dialogue.awaitingLLM ? 'disabled' : ''}>${escapeHtml(
              option.label,
            )}</button>`,
        )
        .join('');
      const tradeButton = agent?.tradeProfile?.enabled
        ? `<button type="button" data-trade-agent="${agent.id}" ${dialogue.awaitingLLM ? 'disabled' : ''}>Trade</button>`
        : '';
      this.dialogueOptions.innerHTML = `${optionButtons}${tradeButton}`;
      changed = true;
    }

    return changed;
  }

  private installPanelToggles(): void {
    [
      ['top-hud', 'HUD'],
      ['player-hud', 'Player'],
      ['inventory-panel', 'Inventory'],
      ['deduction-panel', 'Deduction'],
      ['player-creator', 'Create'],
      ['dialogue-panel', 'Dialogue'],
      ['agent-panel', 'Agent'],
      ['event-console', 'Log'],
    ].forEach(([id, label]) => this.ensurePanelToggle(getElement<HTMLElement>(id), label));

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest<HTMLButtonElement>('button[data-collapse-target]');
      const panelId = button?.dataset.collapseTarget;
      if (!button || !panelId) {
        return;
      }

      const panel = document.getElementById(panelId);
      if (!panel) {
        return;
      }

      panel.classList.toggle('is-collapsed');
      button.setAttribute('aria-expanded', String(!panel.classList.contains('is-collapsed')));
      event.preventDefault();
      event.stopPropagation();
    });
  }

  private ensurePanelToggle(panel: HTMLElement, label: string): void {
    if (panel.querySelector(':scope > .panel-toggle')) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-toggle';
    button.dataset.collapseTarget = panel.id;
    button.setAttribute('aria-expanded', String(!panel.classList.contains('is-collapsed')));
    button.textContent = label;
    panel.prepend(button);
  }
}
