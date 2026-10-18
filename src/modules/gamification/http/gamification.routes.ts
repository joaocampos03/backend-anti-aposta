import { Router, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { GAMIFICATION_MESSAGES } from '../application/gamification.messages.js';
import type { GamificationController } from './gamification.controller.js';

export interface GamificationRouteDependencies {
  readonly controller: GamificationController;
  readonly requireSession: RequestHandler;
  readonly validateCreateSavingsGoalBody: RequestHandler;
  readonly validateRecordMovementBody: RequestHandler;
  readonly validateSetBettingCeilingBody: RequestHandler;
  readonly validateGoalIdParams: RequestHandler;
  readonly validatePageQuery: RequestHandler;
  readonly validateIdempotencyHeaders: RequestHandler;
  /** So a script cannot flood a ledger the person is trusting us to keep. */
  readonly commandRateLimits: readonly RequestHandler[];
}

/**
 * The goals and achievements screens. Two goal resources on purpose: a savings goal is what the user
 * records, the betting ceiling is measured from the statement, and the paths
 * keep them as apart as the screen does.
 */
export function gamificationRoutes(dependencies: GamificationRouteDependencies): Router {
  const router = Router();

  router.get(
    '/savings-goals',
    internalErrorMessage(GAMIFICATION_MESSAGES.goalsUnavailable),
    dependencies.requireSession,
    dependencies.validatePageQuery,
    dependencies.controller.listSavingsGoals,
  );

  router.post(
    '/savings-goals',
    internalErrorMessage(GAMIFICATION_MESSAGES.createUnavailable),
    dependencies.requireSession,
    ...dependencies.commandRateLimits,
    dependencies.validateCreateSavingsGoalBody,
    dependencies.controller.createSavingsGoal,
  );

  router.get(
    '/savings-goals/:goalId/movements',
    internalErrorMessage(GAMIFICATION_MESSAGES.movementsUnavailable),
    dependencies.requireSession,
    dependencies.validateGoalIdParams,
    dependencies.validatePageQuery,
    dependencies.controller.listGoalMovements,
  );

  // Not idempotent by nature, so it takes an `Idempotency-Key`: a retried tap
  // answers the movement it already booked instead of booking it twice.
  router.post(
    '/savings-goals/:goalId/movements',
    internalErrorMessage(GAMIFICATION_MESSAGES.recordUnavailable),
    dependencies.requireSession,
    ...dependencies.commandRateLimits,
    dependencies.validateGoalIdParams,
    dependencies.validateIdempotencyHeaders,
    dependencies.validateRecordMovementBody,
    dependencies.controller.recordGoalMovement,
  );

  // No consent is a successful answer: the user's own ceiling, and no figure
  // that would read as "you did not bet".
  router.get(
    '/betting-ceiling',
    internalErrorMessage(GAMIFICATION_MESSAGES.ceilingUnavailable),
    dependencies.requireSession,
    dependencies.controller.describeBettingCeiling,
  );

  // A singleton the caller owns, set whole: `PUT`, and idempotent as `PUT` is —
  // the same value twice leaves the same terms.
  router.put(
    '/betting-ceiling',
    internalErrorMessage(GAMIFICATION_MESSAGES.setCeilingUnavailable),
    dependencies.requireSession,
    ...dependencies.commandRateLimits,
    dependencies.validateSetBettingCeilingBody,
    dependencies.controller.setBettingCeiling,
  );

  // Reading also awards what fell due since the last look — a streak badge can
  // become due only because a day passed. Idempotent: a badge is awarded once.
  router.get(
    '/achievements',
    internalErrorMessage(GAMIFICATION_MESSAGES.achievementsUnavailable),
    dependencies.requireSession,
    dependencies.controller.describeAchievements,
  );

  return router;
}
