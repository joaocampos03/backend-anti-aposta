import type { DomainError } from '@shared/domain/domain-error.js';

export type OpenFinanceErrorCode = 'CONSENT_NOT_AUTHORISED' | 'ACCOUNT_NOT_FOUND';

export class OpenFinanceError<TCode extends OpenFinanceErrorCode = OpenFinanceErrorCode>
  implements DomainError
{
  private constructor(readonly code: TCode) {}

  static consentNotAuthorised(): OpenFinanceError<'CONSENT_NOT_AUTHORISED'> {
    return new OpenFinanceError('CONSENT_NOT_AUTHORISED');
  }

  static accountNotFound(): OpenFinanceError<'ACCOUNT_NOT_FOUND'> {
    return new OpenFinanceError('ACCOUNT_NOT_FOUND');
  }
}
