import { Router, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { BET_DETECTION_MESSAGES } from '../application/bet-detection.messages.js';
import type { BetDetectionController } from './bet-detection.controller.js';

export interface BetDetectionRouteDependencies {
  readonly controller: BetDetectionController;
  readonly requireSession: RequestHandler;
  readonly validateTransactionIdParams: RequestHandler;
  readonly validateOverrideBody: RequestHandler;
  /** So a script cannot rewrite a history through this endpoint. */
  readonly overrideRateLimits: readonly RequestHandler[];
}

/**
 * The correction and its undo. A genuine command that is not CRUD becomes a
 * sub-resource, which is why this is `.../classification-override` rather than
 * a verb in the path.
 */
export function betDetectionRoutes(dependencies: BetDetectionRouteDependencies): Router {
  const router = Router();

  router.post(
    '/transactions/:transactionId/classification-override',
    internalErrorMessage(BET_DETECTION_MESSAGES.overrideUnavailable),
    dependencies.requireSession,
    ...dependencies.overrideRateLimits,
    dependencies.validateTransactionIdParams,
    dependencies.validateOverrideBody,
    dependencies.controller.override,
  );

  router.delete(
    '/transactions/:transactionId/classification-override',
    internalErrorMessage(BET_DETECTION_MESSAGES.revertUnavailable),
    dependencies.requireSession,
    ...dependencies.overrideRateLimits,
    dependencies.validateTransactionIdParams,
    dependencies.controller.revert,
  );

  return router;
}
