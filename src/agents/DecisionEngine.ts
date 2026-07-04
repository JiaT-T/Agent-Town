import { getLocationCenter, LOCATION_BY_ID, type LocationId } from '../data/locations';
import type { Agent, Observation, PlanResult, ScheduleEntry, WorldEvent } from './types';
import { minutesUntil, parseTimeToMinutes } from './time';

function getCurrentScheduleEntry(schedule: ScheduleEntry[], timeMinutes: number): ScheduleEntry {
  const sortedSchedule = [...schedule].sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
  let active = sortedSchedule[0];

  for (const entry of sortedSchedule) {
    if (parseTimeToMinutes(entry.start) <= timeMinutes) {
      active = entry;
    }
  }

  return active;
}

function roleEventScore(agent: Agent, event: WorldEvent): number {
  const text = `${event.description} ${LOCATION_BY_ID[event.locationId].name}`.toLowerCase();
  let score = 0;

  if (text.includes('music') || text.includes('party') || text.includes('festival')) score += 2;
  if (text.includes('meeting') || text.includes('announcement') || text.includes('news') || text.includes('gathering')) {
    score += 2;
  }
  if (text.includes('coffee') || text.includes('food') || text.includes('lunch') || text.includes('restaurant')) score += 2;
  if (text.includes('study') || text.includes('research') || text.includes('library')) score += 2;

  if ((agent.role === 'Journalist' || agent.role === 'Reporter') && /meeting|announcement|news|party|crowd|town|gathering/.test(text)) {
    score += 3;
  }
  if (agent.role === 'Tourist' && /music|party|park|square|festival|photo|gathering/.test(text)) score += 3;
  if (agent.role === 'Cafe Owner' && /cafe|coffee|restaurant|food|crowd|party|visitor|gathering/.test(text)) score += 3;
  if (agent.role === 'Researcher' && /library|research|meeting|talk|study/.test(text)) score += 3;
  if (agent.role === 'Student' && /library|study|music|party|cafe|park/.test(text)) score += 3;

  if (/social|curious|spontaneous|alert|community/.test(agent.personality.toLowerCase())) score += 1;
  if (agent.needs.social < 45 && event.locationId === 'townSquare') score += 2;
  if (agent.needs.hunger < 35 && /cafe|coffee|restaurant|food|lunch/.test(text)) score += 3;
  if (agent.needs.energy < 20 && event.locationId !== 'home' && agent.role !== 'Journalist') score -= 2;
  return score;
}

export function isAgentInterestedInEvent(agent: Agent, event: WorldEvent): boolean {
  return roleEventScore(agent, event) >= 4;
}

function activeEventForAgent(agent: Agent, observation: Observation): WorldEvent | undefined {
  return observation.allEvents.find((event) => {
    if (!event.interestedAgentIds.includes(agent.id)) {
      return false;
    }

    if (event.source === 'player') {
      return true;
    }

    const untilEvent = minutesUntil(observation.timeMinutes, event.timeMinutes);
    const sinceEvent = minutesUntil(event.timeMinutes, observation.timeMinutes);
    return untilEvent <= 60 || sinceEvent <= 90;
  });
}

function eventPlan(agent: Agent, event: WorldEvent): PlanResult {
  const placeName = LOCATION_BY_ID[event.locationId].name;
  const roleAction =
    agent.role === 'Journalist' || agent.role === 'Reporter'
      ? 'interviewing attendees'
      : agent.role === 'Cafe Owner'
        ? 'observing visitor flow'
        : 'attending event';
  const roleGoal =
    agent.role === 'Journalist' || agent.role === 'Reporter'
      ? `Interview people about ${event.title}`
      : agent.role === 'Cafe Owner'
        ? `Watch crowd flow around ${event.title}`
        : `Attend ${event.title}`;
  const roleReason =
    agent.role === 'Journalist' || agent.role === 'Reporter'
      ? ' As a journalist, I want to interview people there.'
      : agent.role === 'Cafe Owner'
        ? ' As the cafe owner, I want to understand the visitor flow.'
        : '';

  return {
    destination: event.locationId,
    action: roleAction,
    goal: roleGoal,
    reason: `I heard about ${event.title}, so I will go to ${placeName}.${roleReason}`,
    planSummary: `I should go to ${placeName} because I am interested in ${event.title}.`,
    mood: agent.role === 'Journalist' || agent.role === 'Reporter' ? 'curious' : 'social',
  };
}

function needsPlan(agent: Agent): PlanResult | undefined {
  if (agent.needs.hunger < 30) {
    return {
      destination: 'cafe',
      action: 'getting food',
      goal: 'Raise hunger need at the Cafe',
      reason: 'I am hungry, so I am going to Cafe.',
      planSummary: 'I should get food because my hunger need is low.',
      mood: 'hungry',
    };
  }

  if (agent.needs.energy < 25) {
    return {
      destination: 'home',
      action: 'resting',
      goal: 'Recover energy at Home',
      reason: 'My energy is low, so I am going Home to rest.',
      planSummary: 'I should rest because my energy need is low.',
      mood: 'tired',
    };
  }

  if (agent.needs.social < 25) {
    return {
      destination: 'townSquare',
      action: 'looking for conversation',
      goal: 'Find people to talk with at Town Square',
      reason: 'My social need is low, so I am going to Town Square to meet people.',
      planSummary: 'I should find people because my social need is low.',
      mood: 'social',
    };
  }

  return undefined;
}

export class DecisionEngine {
  // Plan chooses the next destination and action. Movement and rendering are
  // deliberately handled elsewhere so the Agent Loop remains testable.
  plan(agent: Agent, observation: Observation): PlanResult {
    const event = activeEventForAgent(agent, observation);
    if (event) {
      return eventPlan(agent, event);
    }

    const needsDrivenPlan = needsPlan(agent);
    if (needsDrivenPlan) {
      return needsDrivenPlan;
    }

    const scheduleEntry = getCurrentScheduleEntry(agent.schedule, observation.timeMinutes);
    const placeName = LOCATION_BY_ID[scheduleEntry.locationId].name;
    return {
      destination: scheduleEntry.locationId,
      action: scheduleEntry.action,
      goal: scheduleEntry.goal,
      reason: `It is ${observation.timeLabel}, so I am going to ${placeName} for ${scheduleEntry.action}.`,
      planSummary: `I should be ${scheduleEntry.action} because my schedule says ${placeName} at ${scheduleEntry.start}.`,
      mood: scheduleEntry.locationId === 'library' ? 'focused' : 'cheerful',
    };
  }

  planForEvent(agent: Agent, event: WorldEvent): PlanResult {
    return eventPlan(agent, event);
  }

  isAtDestination(agent: Agent, destination: LocationId): boolean {
    const target = getLocationCenter(destination);
    const dx = target.x - agent.position.x;
    const dy = target.y - agent.position.y;
    return Math.hypot(dx, dy) < 10;
  }
}
