import { AppError, type AppErrorDetails } from '@shared/application/app-error.js';
import { BET_DETECTION_MESSAGES } from './bet-detection.messages.js';

export const betDetectionFailures = {
  /**
   * The same answer for a transaction that does not exist and one that belongs
   * to somebody else. A 403 would confirm the second.
   */
  transactionNotFound: (): AppError =>
    new AppError('TRANSACTION_NOT_FOUND', BET_DETECTION_MESSAGES.transactionNotFound, 404),

  notClassifiedAsBet: (): AppError =>
    new AppError('NOT_CLASSIFIED_AS_BET', BET_DETECTION_MESSAGES.notClassifiedAsBet, 422),

  alreadyOverridden: (): AppError =>
    new AppError('ALREADY_OVERRIDDEN', BET_DETECTION_MESSAGES.alreadyOverridden, 409),

  overrideNotFound: (): AppError =>
    new AppError('OVERRIDE_NOT_FOUND', BET_DETECTION_MESSAGES.overrideNotFound, 404),

  validationFailed: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', BET_DETECTION_MESSAGES.validationFailed, 422, details),
} as const;
