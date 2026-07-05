import type { LLMPlayerDialogueResult } from '../ai/LLMClient';
import { findLocationByText, LOCATION_BY_ID, type LocationId } from '../data/locations';
import type { ActionContract, TaskContractKind } from './ActionContract';
import type { Agent, AgentEmoteKind } from './types';

export type InterpretedAction = ActionContract;

export interface InterpretedPlayerDialogue {
  actions: ActionContract[];
  emote?: AgentEmoteKind;
}

const LOCATION_ALIASES: Array<[RegExp, LocationId]> = [
  [/town\s*square|square|plaza|广场|鎮广场|镇中心|城镇中心/i, 'townSquare'],
  [/coffee|cafe|咖啡/i, 'cafe'],
  [/restaurant|餐厅|餐館|饭店/i, 'restaurant'],
  [/library|图书馆|圖書館/i, 'library'],
  [/school|学校|學校/i, 'school'],
  [/clinic|doctor|hospital|诊所|診所|医院|醫院/i, 'clinic'],
  [/studio|工作室|画室|畫室/i, 'studio'],
  [/workshop|repair|工坊|维修|維修/i, 'workshop'],
  [/grocery|market|杂货|雜貨|商店/i, 'grocery'],
  [/bakery|面包|麵包|烘焙/i, 'bakery'],
  [/inn|hotel|旅馆|旅館/i, 'inn'],
  [/farm|field|农田|農田|农场|農場/i, 'farm'],
  [/post|mail|邮局|郵局/i, 'postOffice'],
  [/dock|harbor|pier|码头|碼頭/i, 'dock'],
  [/park|forest|树林|樹林|公园|公園/i, 'park'],
  [/home|house|家里|家裏|回家/i, 'home'],
];

function normalizeLocationId(value?: string): LocationId | undefined {
  if (!value) return undefined;
  const direct = Object.keys(LOCATION_BY_ID).includes(value) ? (value as LocationId) : undefined;
  if (direct) return direct;

  const byName = findLocationByText(value);
  if (byName) return byName.id;

  const match = LOCATION_ALIASES.find(([pattern]) => pattern.test(value));
  return match?.[1];
}

function normalizeEmote(value = ''): AgentEmoteKind | undefined {
  const text = value.toLowerCase();
  if (/heart|love|like|affection|happy|warm|enjoy|喜欢|喜歡|爱|愛|开心|開心/.test(text)) return 'heart';
  if (/message|talk|tell|news|lead|notice|消息|新闻|新聞|提醒|想说|想說/.test(text)) return 'message';
  if (/question|unsure|doubt|confused|maybe|疑问|疑問|怀疑|懷疑/.test(text)) return 'question';
  if (/angry|lie|deceive|false|betray|生气|生氣|撒谎|撒謊|欺骗|欺騙/.test(text)) return 'angry';
  if (/sad|sorry|upset|难过|難過|抱歉/.test(text)) return 'sad';
  if (/surprise|urgent|fire|danger|emergency|着火|著火|危险|危險|紧急|緊急/.test(text)) return 'surprise';
  if (/neutral/.test(text)) return 'neutral';
  return undefined;
}

function isFollowText(text: string): boolean {
  return /follow|come with|go with|walk with|lead the way|跟着|跟著|跟我|一起走|一起去|同去|陪我/.test(text);
}

function isInspectionText(text: string): boolean {
  return /inspect|check|verify|investigate|look at|go see|take a look|confirm|查看|检查|檢查|确认|確認|看一眼|过去看看|過去看看|核实|核實|着火|著火|火灾|火災|危险|危險|紧急|緊急/.test(
    text,
  );
}

function textReason(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeWireAction(raw: unknown): ActionContract | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const action = raw as Record<string, unknown>;
  const type = typeof action.type === 'string' ? action.type : typeof action.kind === 'string' ? action.kind : '';
  const target =
    normalizeLocationId(action.targetLocationId as string | undefined) ??
    normalizeLocationId(action.targetLocation as string | undefined) ??
    normalizeLocationId(action.destination as string | undefined);
  const reason = textReason(action.reason, 'LLM requested an action.');

  if (type === 'goToLocation' && target) {
    return {
      type: 'goToLocation',
      targetLocationId: target,
      reason,
      goal: typeof action.goal === 'string' ? action.goal : undefined,
      action: typeof action.action === 'string' ? action.action : undefined,
    };
  }

  if (type === 'followPlayer') {
    return { type: 'followPlayer', targetLocationId: target, reason };
  }

  if (type === 'inspectLocation' && target) {
    const urgency = action.urgency === 'low' || action.urgency === 'high' ? action.urgency : 'normal';
    return {
      type: 'inspectLocation',
      targetLocationId: target,
      reason,
      claim: typeof action.claim === 'string' ? action.claim : undefined,
      urgency,
    };
  }

  if (type === 'returnHome') {
    return { type: 'returnHome', reason };
  }

  if (type === 'askPlayerForItem' && typeof action.itemId === 'string') {
    return {
      type: 'askPlayerForItem',
      itemId: action.itemId,
      quantity: typeof action.quantity === 'number' ? action.quantity : undefined,
      rewardGold: typeof action.rewardGold === 'number' ? action.rewardGold : undefined,
      reason,
    };
  }

  if (type === 'offerTrade') {
    return { type: 'offerTrade', reason };
  }

  if (type === 'tellRumor' && typeof action.claim === 'string') {
    return {
      type: 'tellRumor',
      claim: action.claim,
      targetAgentId: typeof action.targetAgentId === 'string' ? action.targetAgentId : undefined,
      reason,
    };
  }

  if (type === 'shareBelief' && typeof action.summary === 'string') {
    return {
      type: 'shareBelief',
      summary: action.summary,
      beliefId: typeof action.beliefId === 'string' ? action.beliefId : undefined,
      targetAgentId: typeof action.targetAgentId === 'string' ? action.targetAgentId : undefined,
      reason,
    };
  }

  if (type === 'showEmote') {
    const emote = normalizeEmote(typeof action.emote === 'string' ? action.emote : reason);
    return emote ? { type: 'showEmote', emote, reason } : undefined;
  }

  if (type === 'adjustRelationship') {
    return {
      type: 'adjustRelationship',
      reason,
      familiarity: typeof action.familiarity === 'number' ? action.familiarity : undefined,
      trust: typeof action.trust === 'number' ? action.trust : undefined,
      affinity: typeof action.affinity === 'number' ? action.affinity : undefined,
    };
  }

  if (type === 'waitAtPost') {
    return { type: 'waitAtPost', reason };
  }

  if (type === 'createTask') {
    const contractKind =
      action.contractKind === 'talkToAgent' ||
      action.contractKind === 'deliverItem' ||
      action.contractKind === 'gatherItem' ||
      action.contractKind === 'inspectLocation' ||
      action.contractKind === 'buyOrSellItem' ||
      action.contractKind === 'verifyRumor'
        ? (action.contractKind as TaskContractKind)
        : target
          ? 'inspectLocation'
          : undefined;
    if (!contractKind) return undefined;
    return {
      type: 'createTask',
      title: typeof action.title === 'string' ? action.title : 'Town request',
      description: typeof action.description === 'string' ? action.description : reason,
      contractKind,
      reason,
      targetLocationId: target,
      targetAgentId: typeof action.targetAgentId === 'string' ? action.targetAgentId : undefined,
      requiredItemId: typeof action.requiredItemId === 'string' ? action.requiredItemId : typeof action.itemId === 'string' ? action.itemId : undefined,
      targetBeliefId: typeof action.targetBeliefId === 'string' ? action.targetBeliefId : undefined,
      rewardGold: typeof action.rewardGold === 'number' ? action.rewardGold : undefined,
      rewardReputation: typeof action.rewardReputation === 'number' ? action.rewardReputation : undefined,
    };
  }

  if (type === 'reportIncident') {
    return {
      type: 'reportIncident',
      reason,
      incidentId: typeof action.incidentId === 'string' ? action.incidentId : undefined,
      title: typeof action.title === 'string' ? action.title : undefined,
      summary: typeof action.summary === 'string' ? action.summary : typeof action.claim === 'string' ? action.claim : undefined,
      targetLocationId: target,
    };
  }

  if (type === 'verifyRumor') {
    return {
      type: 'verifyRumor',
      reason,
      targetBeliefId: typeof action.targetBeliefId === 'string' ? action.targetBeliefId : undefined,
      targetLocationId: target,
    };
  }

  if (type === 'requestHelp') {
    return {
      type: 'requestHelp',
      reason,
      targetAgentId: typeof action.targetAgentId === 'string' ? action.targetAgentId : undefined,
      targetLocationId: target,
    };
  }

  if (type === 'rejectAction') {
    return { type: 'rejectAction', reason };
  }

  return undefined;
}

function uniqueActions(actions: ActionContract[]): ActionContract[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = JSON.stringify(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function interpretPlayerDialogueAction(
  agent: Agent,
  result: LLMPlayerDialogueResult,
  playerMessage: string,
): InterpretedPlayerDialogue {
  const text = [
    playerMessage,
    result.playerIntent,
    result.npcIntent,
    result.actionText,
    result.targetLocation,
    result.possiblePlanChange?.reason,
  ]
    .filter(Boolean)
    .join(' ');
  const actions: ActionContract[] = [];
  const emote = normalizeEmote(result.emoteIntent) ?? normalizeEmote(text);
  const planTarget =
    normalizeLocationId(result.targetLocation) ??
    normalizeLocationId(result.possiblePlanChange?.targetLocation) ??
    normalizeLocationId(result.possiblePlanChange?.destination) ??
    normalizeLocationId(text);

  for (const rawAction of result.actions ?? []) {
    const normalized = normalizeWireAction(rawAction);
    if (normalized) actions.push(normalized);
  }

  if (result.possiblePlanChange?.followPlayer || isFollowText(text)) {
    actions.push({
      type: 'followPlayer',
      reason: result.possiblePlanChange?.reason || result.actionText || `${agent.name} decided to follow the player.`,
      targetLocationId: planTarget,
    });
  } else if (isInspectionText(text) && planTarget) {
    actions.push({
      type: 'inspectLocation',
      reason: result.actionText || result.npcIntent || `${agent.name} decided to inspect ${LOCATION_BY_ID[planTarget].name}.`,
      targetLocationId: planTarget,
      urgency: result.urgency ?? (/fire|danger|emergency|着火|著火|危险|危險|紧急|緊急/.test(text) ? 'high' : 'normal'),
      claim: playerMessage || result.playerIntent || result.actionText || 'player claim',
    });
  } else if (result.possiblePlanChange?.destination && planTarget) {
    actions.push({
      type: 'goToLocation',
      targetLocationId: planTarget,
      reason: result.possiblePlanChange.reason || result.npcIntent || `Go to ${LOCATION_BY_ID[planTarget].name}.`,
      goal: result.possiblePlanChange.goal,
      action: result.possiblePlanChange.action,
    });
  }

  if (emote) {
    actions.push({
      type: 'showEmote',
      emote,
      reason: result.actionText || result.npcIntent || `${agent.name} shows ${emote}.`,
    });
  }

  return { actions: uniqueActions(actions), emote };
}
