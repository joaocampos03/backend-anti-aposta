import { AppError, type AppErrorDetails } from '@shared/application/app-error.js';
import { assertNever } from '@shared/domain/assert-never.js';
import type { OpenFinanceError } from '../domain/open-finance.errors.js';
import type { DataHolderFailure } from './ports/data-holder.port.js';
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

  consentRequestInvalid: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', OPEN_FINANCE_MESSAGES.consentRequestInvalid, 422, details),

  /** Another user's consent is answered exactly as a missing one. */
  consentNotFound: (): AppError =>
    new AppError('CONSENT_NOT_FOUND', OPEN_FINANCE_MESSAGES.consentNotFound, 404),

  consentAlreadyAuthorised: (): AppError =>
    new AppError('CONSENT_ALREADY_AUTHORISED', OPEN_FINANCE_MESSAGES.consentAlreadyAuthorised, 409),

  /** Only the institution may notify; anybody else gets the same answer as no credentials. */
  dataHolderNotRecognised: (): AppError =>
    new AppError('UNAUTHENTICATED', OPEN_FINANCE_MESSAGES.dataHolderNotRecognised, 401),

  dataHolderNoticeInvalid: (details: AppErrorDetails): AppError =>
    new AppError('VALIDATION_FAILED', OPEN_FINANCE_MESSAGES.dataHolderNoticeInvalid, 422, details),

  authorisationNotPending: (): AppError =>
    new AppError('AUTHORISATION_NOT_PENDING', OPEN_FINANCE_MESSAGES.authorisationNotPending, 409),

  fromDomain: (error: OpenFinanceError): AppError => {
    switch (error.code) {
      case 'CONSENT_NOT_AUTHORISED':
        return new AppError('CONSENT_NOT_AUTHORISED', OPEN_FINANCE_MESSAGES.consentNotAuthorised, 422);
      case 'CONSENT_NOT_AWAITING_AUTHORISATION':
        return new AppError(
          'CONSENT_NOT_AWAITING_AUTHORISATION',
          OPEN_FINANCE_MESSAGES.consentNotAwaitingAuthorisation,
          409,
        );
      case 'ACCOUNT_NOT_FOUND':
        return openFinanceFailures.accountNotFound();
      case 'AUTHORISATION_STATE_MISMATCH':
        return new AppError(
          'AUTHORISATION_STATE_MISMATCH',
          OPEN_FINANCE_MESSAGES.authorisationStateMismatch,
          422,
        );
      case 'AUTHORISATION_EXPIRED':
        return new AppError('AUTHORISATION_EXPIRED', OPEN_FINANCE_MESSAGES.authorisationExpired, 422);
      default:
        return assertNever(error.code);
    }
  },

  /**
   * `REFUSED` is the institution's answer and the person can act on it;
   * `UNAVAILABLE` is ours to report honestly — nothing was changed.
   */
  fromDataHolder: (failure: DataHolderFailure): AppError => {
    switch (failure) {
      case 'REFUSED':
        return new AppError('AUTHORISATION_REFUSED', OPEN_FINANCE_MESSAGES.authorisationRefused, 422);
      case 'UNAVAILABLE':
        return new AppError(
          'DATA_HOLDER_UNAVAILABLE',
          OPEN_FINANCE_MESSAGES.dataHolderUnavailable,
          502,
        );
      default:
        return assertNever(failure);
    }
  },
} as const;
