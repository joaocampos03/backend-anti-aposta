import type { DomainError } from '@shared/domain/domain-error.js';

export type SandboxBankErrorCode =
  | 'INVALID_LEDGER_ENTRY'
  | 'INVALID_CONSENT_REQUEST'
  | 'CONSENT_NOT_AWAITING_AUTHORISATION'
  | 'NO_ACCOUNT_SELECTED'
  | 'ACCOUNT_NOT_OWNED'
  | 'INVALID_GRANT';

/** A code and nothing else: the wording is the application layer's to choose. */
export class SandboxBankError<TCode extends SandboxBankErrorCode = SandboxBankErrorCode>
  implements DomainError
{
  private constructor(readonly code: TCode) {}

  static invalidLedgerEntry(): SandboxBankError<'INVALID_LEDGER_ENTRY'> {
    return new SandboxBankError('INVALID_LEDGER_ENTRY');
  }

  static invalidConsentRequest(): SandboxBankError<'INVALID_CONSENT_REQUEST'> {
    return new SandboxBankError('INVALID_CONSENT_REQUEST');
  }

  static consentNotAwaitingAuthorisation(): SandboxBankError<'CONSENT_NOT_AWAITING_AUTHORISATION'> {
    return new SandboxBankError('CONSENT_NOT_AWAITING_AUTHORISATION');
  }

  static noAccountSelected(): SandboxBankError<'NO_ACCOUNT_SELECTED'> {
    return new SandboxBankError('NO_ACCOUNT_SELECTED');
  }

  static accountNotOwned(): SandboxBankError<'ACCOUNT_NOT_OWNED'> {
    return new SandboxBankError('ACCOUNT_NOT_OWNED');
  }

  /** OAuth's own word for a code or refresh token that cannot be used. */
  static invalidGrant(): SandboxBankError<'INVALID_GRANT'> {
    return new SandboxBankError('INVALID_GRANT');
  }
}
