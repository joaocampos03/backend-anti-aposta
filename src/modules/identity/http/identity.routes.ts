import { Router, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { IDENTITY_MESSAGES } from '../application/identity.messages.js';
import type { IdentityController } from './identity.controller.js';

export interface IdentityRouteDependencies {
  readonly controller: IdentityController;
  readonly validateRegisterUserBody: RequestHandler;
  readonly validateSignInBody: RequestHandler;
  readonly validateResetPasswordBody: RequestHandler;
  readonly validateChangeDisplayNameBody: RequestHandler;
  readonly validateChangeEmailBody: RequestHandler;
  readonly validateChangePasswordBody: RequestHandler;
  readonly validateDeleteAccountBody: RequestHandler;
  readonly requireSession: RequestHandler;
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

  router.get(
    '/identity/users/current',
    internalErrorMessage(IDENTITY_MESSAGES.accountUnavailable),
    dependencies.requireSession,
    dependencies.controller.account,
  );

  router.put(
    '/identity/users/current/display-name',
    internalErrorMessage(IDENTITY_MESSAGES.accountChangeUnavailable),
    dependencies.requireSession,
    dependencies.validateChangeDisplayNameBody,
    dependencies.controller.changeDisplayName,
  );

  router.put(
    '/identity/users/current/email',
    internalErrorMessage(IDENTITY_MESSAGES.accountChangeUnavailable),
    dependencies.requireSession,
    dependencies.validateChangeEmailBody,
    dependencies.controller.changeEmail,
  );

  router.put(
    '/identity/users/current/password',
    internalErrorMessage(IDENTITY_MESSAGES.passwordChangeUnavailable),
    dependencies.requireSession,
    dependencies.validateChangePasswordBody,
    dependencies.controller.changePassword,
  );

  router.delete(
    '/identity/sessions/others',
    internalErrorMessage(IDENTITY_MESSAGES.accountChangeUnavailable),
    dependencies.requireSession,
    dependencies.controller.endOtherSessions,
  );

  router.post(
    '/identity/users/current/deletion',
    internalErrorMessage(IDENTITY_MESSAGES.accountDeletionUnavailable),
    dependencies.requireSession,
    dependencies.validateDeleteAccountBody,
    dependencies.controller.deleteAccount,
  );

  return router;
}
