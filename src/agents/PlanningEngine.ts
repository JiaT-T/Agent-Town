import type { Agent, DailyPlanEntry, Observation, PlanResult, TaskDecompositionEntry, WorldEvent } from './types';
import { DecisionEngine } from './DecisionEngine';
import { LOCATION_BY_ID } from '../data/locations';
import { DAY_MINUTES, parseTimeToMinutes } from './time';

export interface LLMPlanCandidate {
  destination?: string;
  action?: string;
  goal?: string;
  reason?: string;
}

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  plan?: PlanResult;
}

export class PlanningEngine {
  private readonly decisionEngine = new DecisionEngine();

  buildDailyPlan(agent: Agent): DailyPlanEntry[] {
    const ordered = [...agent.schedule].sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
    return ordered.map((entry, index) => {
      const startMinutes = parseTimeToMinutes(entry.start);
      const next = ordered[index + 1];
      const nextStart = next ? parseTimeToMinutes(next.start) : DAY_MINUTES;
      const durationMinutes = Math.max(15, nextStart - startMinutes);
      return {
        startMinutes,
        durationMinutes,
        locationId: entry.locationId,
        action: entry.action,
        goal: entry.goal,
      };
    });
  }

  decomposeTask(action: string, durationMinutes: number): TaskDecompositionEntry[] {
    const safeDuration = Math.max(15, Math.round(durationMinutes));
    if (/sleep|rest/i.test(action)) {
      return [{ action, durationMinutes: safeDuration }];
    }

    const setup = Math.max(5, Math.round(safeDuration * 0.2));
    const main = Math.max(5, Math.round(safeDuration * 0.6));
    const wrap = Math.max(5, safeDuration - setup - main);
    return [
      { action: `prepare for ${action}`, durationMinutes: setup },
      { action, durationMinutes: main },
      { action: `wrap up ${action}`, durationMinutes: wrap },
    ];
  }

  planFromScheduleAndNeeds(agent: Agent, observation: Observation): PlanResult {
    return this.decisionEngine.plan(agent, observation);
  }

  planFromEvent(agent: Agent, event: WorldEvent): PlanResult {
    return this.decisionEngine.planForEvent(agent, event);
  }

  validateLLMPlan(candidate: LLMPlanCandidate): PlanValidationResult {
    const errors: string[] = [];
    const locationIds = Object.keys(LOCATION_BY_ID);

    if (!candidate.destination || !locationIds.includes(candidate.destination)) {
      errors.push(`destination must be one of: ${locationIds.join(', ')}`);
    }

    if (!candidate.action || candidate.action.trim().length < 3) {
      errors.push('action is required');
    }

    if (!candidate.goal || candidate.goal.trim().length < 3) {
      errors.push('goal is required');
    }

    if (!candidate.reason || candidate.reason.trim().length < 8) {
      errors.push('reason must explain why this plan was selected');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      plan: {
        destination: candidate.destination as PlanResult['destination'],
        action: candidate.action ?? 'acting',
        goal: candidate.goal ?? 'Follow validated plan',
        reason: candidate.reason ?? 'Validated LLM plan.',
        planSummary: candidate.reason ?? 'Validated LLM plan.',
        mood: 'curious',
      },
    };
  }
}
