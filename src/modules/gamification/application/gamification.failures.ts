import { AppError, type AppErrorDetails } from '@shared/application/app-error.js';
import { assertNever } from '@shared/domain/assert-never.js';
import type { GamificationErrorCode } from '../domain/gamification.errors.js';
import { GAMIFICATION_MESSAGES } from './gamification.messages.js';

type FieldErrorCode = Exclude<GamificationErrorCode, 'INSUFFICIENT_BALANCE'>;

/** Which field a domain refusal belongs to, and the sentence it renders. */
function fieldMessageFor(code: FieldErrorCode): string {
  switch (code) {
    case 'GOAL_TITLE_TOO_SHORT':
      return GAMIFICATION_MESSAGES.titleTooShort;
    case 'GOAL_TITLE_TOO_LONG':
      return GAMIFICATION_MESSAGES.titleTooLong;
    case 'AMOUNT_NOT_AN_INTEGER':
      return GAMIFICATION_MESSAGES.amountInvalid;
    case 'AMOUNT_NOT_POSITIVE':
      return GAMIFICATION_MESSAGES.amountNotPositive;
    case 'AMOUNT_NEGATIVE':
      return GAMIFICATION_MESSAGES.amountNegative;
    case 'AMOUNT_TOO_LARGE':
      return GAMIFICATION_MESSAGES.amountTooLarge;
    case 'DESTINATION_TOO_LONG':
      return GAMIFICATION_MESSAGES.destinationTooLong;
    default:
      return assertNever(code);
  }
}

export const gamificationFailures = {
  /** The same answer for a goal that does not exist and one that is somebody else's. */
  goalNotFound: (): AppError =>
    new AppError('GOAL_NOT_FOUND', GAMIFICATION_MESSAGES.goalNotFound, 404),

  /** The balance travels so the form can say what *can* be withdrawn, in the reader's format. */
  insufficientBalance: (savedInCents: number): AppError =>
    new AppError('INSUFFICIENT_BALANCE', GAMIFICATION_MESSAGES.insufficientBalance, 422, {
      savedInCents,
    }),

  goalModifiedConcurrently: (): AppError =>
    new AppError(
      'GOAL_MODIFIED_CONCURRENTLY',
      GAMIFICATION_MESSAGES.goalModifiedConcurrently,
      409,
    ),

  idempotencyKeyReused: (): AppError =>
    new AppError('IDEMPOTENCY_KEY_REUSED', GAMIFICATION_MESSAGES.idempotencyKeyReused, 409),

  ceilingModifiedConcurrently: (): AppError =>
    new AppError(
      'CEILING_MODIFIED_CONCURRENTLY',
      GAMIFICATION_MESSAGES.ceilingModifiedConcurrently,
      409,
    ),

  validationFailed: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', GAMIFICATION_MESSAGES.validationFailed, 422, details),

  /** A domain refusal of one field, in the same envelope the schema produces. */
  invalidField: (field: string, code: FieldErrorCode): AppError =>
    new AppError('VALIDATION_FAILED', GAMIFICATION_MESSAGES.validationFailed, 422, {
      [field]: fieldMessageFor(code),
    }),

  /** A cursor or a limit the frontend should never have sent. */
  listInvalid: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', GAMIFICATION_MESSAGES.listInvalid, 422, details),
} as const;
