import type { DomainError } from '@shared/domain/domain-error.js';

export type OpenFinanceErrorCode =
  | 'CONSENT_NOT_AUTHORISED'
  | 'CONSENT_NOT_AWAITING_AUTHORISATION'
  | 'ACCOUNT_NOT_FOUND'
  | 'AUTHORISATION_STATE_MISMATCH'
  | 'AUTHORISATION_EXPIRED';

export class OpenFinanceError<TCode extends OpenFinanceErrorCode = OpenFinanceErrorCode>
  implements DomainError
{
  private constructor(readonly code: TCode) {}

  static consentNotAuthorised(): OpenFinanceError<'CONSENT_NOT_AUTHORISED'> {
    return new OpenFinanceError('CONSENT_NOT_AUTHORISED');
  }

  static consentNotAwaitingAuthorisation(): OpenFinanceError<'CONSENT_NOT_AWAITING_AUTHORISATION'> {
    return new OpenFinanceError('CONSENT_NOT_AWAITING_AUTHORISATION');
  }

  static accountNotFound(): OpenFinanceError<'ACCOUNT_NOT_FOUND'> {
    return new OpenFinanceError('ACCOUNT_NOT_FOUND');
  }

  static authorisationStateMismatch(): OpenFinanceError<'AUTHORISATION_STATE_MISMATCH'> {
    return new OpenFinanceError('AUTHORISATION_STATE_MISMATCH');
  }

  static authorisationExpired(): OpenFinanceError<'AUTHORISATION_EXPIRED'> {
    return new OpenFinanceError('AUTHORISATION_EXPIRED');
  }
}
