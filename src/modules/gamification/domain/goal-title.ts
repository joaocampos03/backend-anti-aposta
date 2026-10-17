import { fail, ok, type Result } from '@shared/domain/result.js';
import { GamificationError } from './gamification.errors.js';

export const GOAL_TITLE_MINIMUM_LENGTH = 3;
export const GOAL_TITLE_MAXIMUM_LENGTH = 60;

/**
 * The user's own name for a savings goal, and the only title any screen shows.
 * We suggest none: a target the product named is a target the product owns.
 */
export class GoalTitle {
  private constructor(readonly value: string) {}

  static create(
    raw: string,
  ): Result<GoalTitle, GamificationError<'GOAL_TITLE_TOO_SHORT' | 'GOAL_TITLE_TOO_LONG'>> {
    const trimmed = raw.trim();

    if (trimmed.length < GOAL_TITLE_MINIMUM_LENGTH) {
      return fail(GamificationError.of('GOAL_TITLE_TOO_SHORT'));
    }

    if (trimmed.length > GOAL_TITLE_MAXIMUM_LENGTH) {
      return fail(GamificationError.of('GOAL_TITLE_TOO_LONG'));
    }

    return ok(new GoalTitle(trimmed));
  }

  static restore(value: string): GoalTitle {
    const title = GoalTitle.create(value);

    if (!title.ok) {
      throw new Error('Corrupted gamification_savings_goals title');
    }

    return title.value;
  }
}
