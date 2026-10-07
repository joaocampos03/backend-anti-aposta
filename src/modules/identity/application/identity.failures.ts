import { AppError, type AppErrorDetails } from '@shared/application/app-error.js';
import { assertNever } from '@shared/domain/assert-never.js';
import { IDENTITY_MESSAGES } from './identity.messages.js';

/**
 * The failure taxonomy of `identity`, as the frontend switches on it. The `409`
 * is deliberately explicit here and nowhere else: sign-in and password recovery
 * keep undifferentiated answers, because a different message for an unknown
 * address there would turn those forms into a way to enumerate people who may be
 * gambling. Registration is an enumeration oracle whatever the wording, and a
 * vague answer only strands somebody who forgot they had signed up.
 */
export const identityFailures = {
  emailAlreadyRegistered: (): AppError =>
    new AppError('EMAIL_ALREADY_REGISTERED', IDENTITY_MESSAGES.emailAlreadyRegistered, 409, {
      field: 'email',
    }),

  validationFailed: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', IDENTITY_MESSAGES.validationFailed, 422, details),

  consentRequired: (): AppError =>
    new AppError('CONSENT_REQUIRED', IDENTITY_MESSAGES.consentRequired, 422, {
      field: 'acceptedRegistrationConsent',
    }),

  passwordTooShort: (): AppError =>
    new AppError('PASSWORD_TOO_SHORT', IDENTITY_MESSAGES.passwordTooShort, 422, {
      field: 'password',
    }),

  passwordConfirmationMismatch: (): AppError =>
    new AppError(
      'PASSWORD_CONFIRMATION_MISMATCH',
      IDENTITY_MESSAGES.passwordConfirmationMismatch,
      422,
      { field: 'passwordConfirmation' },
    ),

  /**
   * The only credential-related failure sign-in has. It answers for a wrong
   * password, an unknown address, a deleted account and an account pending
   * purge, with the same status, the same message and an empty `details` — so
   * the message cannot be anchored to one field and thereby reveal which half
   * was wrong. The list being protected here is a list of people who may be
   * gambling.
   */
  invalidCredentials: (): AppError =>
    new AppError('INVALID_CREDENTIALS', IDENTITY_MESSAGES.invalidCredentials, 401),

  /**
   * A delay, never a lockout: after the window the correct password works. The
   * message carries no attempt count — a remaining-attempts figure is an
   * enumeration signal and a scolding at once.
   */
  tooManyAttempts: (retryAfterSeconds: number): AppError =>
    new AppError('TOO_MANY_ATTEMPTS', IDENTITY_MESSAGES.tooManySignInAttempts, 429, {
      retryAfterSeconds,
    }),

  /**
   * One message for unknown, expired, already-used and superseded tokens.
   * Telling "expirou" from "já foi usado" tells a token guesser which of their
   * guesses existed.
   */
  passwordResetTokenInvalid: (): AppError =>
    new AppError('RESET_TOKEN_INVALID', IDENTITY_MESSAGES.passwordResetTokenInvalid, 422),

  /** A 401 is never rendered as an error: the person did nothing wrong. */
  sessionInvalid: (): AppError =>
    new AppError('SESSION_INVALID', IDENTITY_MESSAGES.sessionNotValid, 401),

  sessionExpired: (): AppError =>
    new AppError('SESSION_EXPIRED', IDENTITY_MESSAGES.sessionNotValid, 401),
} as const;

/**
 * Shared by registration and by a password reset, so a reset can never refuse a
 * password the register form would have accepted. Length is the only gate;
 * strength stays advice.
 */
export function passwordFailure(code: 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG'): AppError {
  switch (code) {
    case 'PASSWORD_TOO_SHORT':
      return identityFailures.passwordTooShort();
    case 'PASSWORD_TOO_LONG':
      return identityFailures.validationFailed({ password: IDENTITY_MESSAGES.passwordTooLong });
    default:
      return assertNever(code);
  }
}
