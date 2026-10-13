import type { AccountType } from '../../domain/bank-account.js';
import type { Permission } from '../../domain/consent.js';
import type { EntryStatus, EntryType } from '../../domain/ledger-entry.js';

/**
 * What the bank's own screens need — the authorisation screen and the sandbox
 * ledger — consumed by the frontend in this API's usual envelope.
 */

export interface CustomerAccountDto {
  readonly id: string;
  readonly type: AccountType;
  readonly brandName: string;
  readonly branchCode: string;
  /** The last four digits: enough to recognise it, on a screen anybody can see. */
  readonly numberEnding: string;
}

export interface CustomerAccountsOutput {
  readonly items: readonly CustomerAccountDto[];
  readonly nextCursor: null;
}

export interface AuthorisationRequestInput {
  readonly customerId: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly consentId: string;
}

export interface AuthorisationRequestOutput {
  readonly client: { readonly displayName: string };
  readonly consent: {
    readonly id: string;
    readonly permissions: readonly Permission[];
    readonly expiresAt: string;
  };
  readonly accounts: readonly CustomerAccountDto[];
}

export type AuthorisationDecision = 'APPROVE' | 'REJECT';

export interface DecideAuthorisationInput extends AuthorisationRequestInput {
  readonly state: string;
  readonly codeChallenge: string;
  readonly decision: AuthorisationDecision;
  readonly accountIds: readonly string[];
}

export interface DecideAuthorisationOutput {
  /** Where the browser goes next: the client's redirect, with a code or an error. */
  readonly redirectTo: string;
}

export interface RecordLedgerEntryInput {
  readonly customerId: string;
  readonly accountId: string;
  readonly amountInCents: number;
  readonly transactionName: string;
  readonly type: EntryType;
  readonly status: EntryStatus;
  readonly bookedAt: Date | null;
  readonly merchantCategoryCode: number | null;
  readonly payeeDocument: string | null;
}

export interface LedgerEntryDto {
  readonly id: string;
  readonly accountId: string;
  readonly bookedAt: string;
  readonly amountInCents: number;
  readonly transactionName: string;
  readonly type: EntryType;
  readonly status: EntryStatus;
  readonly merchantCategoryCode: number | null;
  readonly payeeDocument: string | null;
}
