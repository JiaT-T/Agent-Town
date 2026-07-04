import type { LLMPlayerDialogueResult } from '../ai/LLMClient';
import { findLocationByText, LOCATION_BY_ID, type LocationId } from '../data/locations';
import type { Agent, AgentEmoteKind } from './types';

export type InterpretedAction =
  | {
      kind: 'followPlayer';
      reason: string;
      targetLocationId?: LocationId;
    }
  | {
      kind: 'inspectLocation';
      reason: string;
      targetLocationId: LocationId;
      urgency: 'low' | 'normal' | 'high';
      claim: string;
    }
  | {
      kind: 'messageForPlayer';
      reason: string;
    };

export interface InterpretedPlayerDialogue {
  actions: InterpretedAction[];
  emote?: AgentEmoteKind;
}

const LOCATION_ALIASES: Array<[RegExp, LocationId]> = [
  [/town\s*square|square|plaza|广场|鎮广场|鎮中心/i, 'townSquare'],
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
  return /follow|come with|go with|walk with|lead the way|跟着|跟著|一起走|一起去|同去|陪我/.test(text);
}

function isInspectionText(text: string): boolean {
  return /inspect|check|verify|investigate|look at|go see|take a look|confirm|查看|检查|檢查|确认|確認|看一眼|过去看看|過去看看|核实|核實|着火|著火|火灾|火災|危险|危險/.test(
    text,
  );
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
  const actions: InterpretedAction[] = [];
  const emote = normalizeEmote(result.emoteIntent) ?? normalizeEmote(text);
  const planTarget =
    normalizeLocationId(result.targetLocation) ??
    normalizeLocationId(result.possiblePlanChange?.targetLocation) ??
    normalizeLocationId(result.possiblePlanChange?.destination) ??
    normalizeLocationId(text);

  if (result.possiblePlanChange?.followPlayer || isFollowText(text)) {
    actions.push({
      kind: 'followPlayer',
      reason: result.possiblePlanChange?.reason || result.actionText || `${agent.name} decided to follow the player.`,
      targetLocationId: planTarget,
    });
  } else if (isInspectionText(text) && planTarget) {
    actions.push({
      kind: 'inspectLocation',
      reason: result.actionText || result.npcIntent || `${agent.name} decided to inspect ${LOCATION_BY_ID[planTarget].name}.`,
      targetLocationId: planTarget,
      urgency: result.urgency ?? (/fire|danger|emergency|着火|著火|危险|危險|紧急|緊急/.test(text) ? 'high' : 'normal'),
      claim: playerMessage || result.playerIntent || result.actionText || 'player claim',
    });
  }

  if (emote === 'message') {
    actions.push({
      kind: 'messageForPlayer',
      reason: result.actionText || result.npcIntent || `${agent.name} wants to talk with the player.`,
    });
  }

  return { actions, emote };
}
