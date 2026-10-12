import { AppError, type AppErrorDetails } from '@shared/application/app-error.js';
import { OPEN_FINANCE_MESSAGES } from './open-finance.messages.js';

export const openFinanceFailures = {
  /**
   * An `accountId` the caller does not own answers 404 and never 403: a 403
   * would confirm that the account exists.
   */
  accountNotFound: (): AppError =>
    new AppError('ACCOUNT_NOT_FOUND', OPEN_FINANCE_MESSAGES.accountNotFound, 404),

  transactionsFilterInvalid: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', OPEN_FINANCE_MESSAGES.transactionsFilterInvalid, 422, details),

  chartsFilterInvalid: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', OPEN_FINANCE_MESSAGES.chartsFilterInvalid, 422, details),
} as const;
