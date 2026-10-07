import { Router, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { IDENTITY_MESSAGES } from '../application/identity.messages.js';
import type { IdentityController } from './identity.controller.js';

export interface IdentityRouteDependencies {
  readonly controller: IdentityController;
  readonly validateRegisterUserBody: RequestHandler;
  readonly validateSignInBody: RequestHandler;
  readonly validateResetPasswordBody: RequestHandler;
  /** Per-IP limits on the unauthenticated writes in this module. */
  readonly registrationRateLimits: readonly RequestHandler[];
  readonly signInRateLimits: readonly RequestHandler[];
  readonly passwordResetRateLimits: readonly RequestHandler[];
}

/** One route, one use case. */
export function identityRoutes(dependencies: IdentityRouteDependencies): Router {
  const router = Router();

  router.post(
    '/identity/users',
    internalErrorMessage(IDENTITY_MESSAGES.registrationUnavailable),
    ...dependencies.registrationRateLimits,
    dependencies.validateRegisterUserBody,
    dependencies.controller.register,
  );

  router.post(
    '/identity/sessions',
    internalErrorMessage(IDENTITY_MESSAGES.signInUnavailable),
    ...dependencies.signInRateLimits,
    dependencies.validateSignInBody,
    dependencies.controller.signIn,
  );

  router.get(
    '/identity/sessions/current',
    internalErrorMessage(IDENTITY_MESSAGES.currentSessionUnavailable),
    dependencies.controller.currentSession,
  );

  router.delete(
    '/identity/sessions/current',
    internalErrorMessage(IDENTITY_MESSAGES.signInUnavailable),
    dependencies.controller.signOut,
  );

  router.post(
    '/identity/password-resets',
    internalErrorMessage(IDENTITY_MESSAGES.passwordChangeUnavailable),
    ...dependencies.passwordResetRateLimits,
    dependencies.validateResetPasswordBody,
    dependencies.controller.resetPassword,
  );

  return router;
}
