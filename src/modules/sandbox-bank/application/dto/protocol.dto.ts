import type { AccountType } from '../../domain/bank-account.js';
import type { ConsentStatus, Permission } from '../../domain/consent.js';
import type { EntryStatus, EntryType } from '../../domain/ledger-entry.js';

/**
 * What the Open Finance surface returns, in the bank's own vocabulary. The
 * presenter turns these into the specification's envelopes; `open-finance`
 * never sees these types — it parses the JSON on its side of the wire.
 */

export type GrantType = 'client_credentials' | 'authorization_code' | 'refresh_token';

export interface IssueTokenInput {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly grantType: GrantType;
  readonly code: string | null;
  readonly redirectUri: string | null;
  readonly codeVerifier: string | null;
  readonly refreshToken: string | null;
}

export interface IssuedTokenDto {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly refreshToken: string | null;
  readonly scope: 'consents' | 'accounts';
  readonly consentId: string | null;
}

export interface CreateConsentInput {
  readonly clientId: string;
  readonly permissions: readonly Permission[];
  readonly expiresAt: Date;
}

export interface RevokeConsentInput {
  readonly clientId: string;
  readonly consentId: string;
}

export interface ConsentDto {
  readonly consentId: string;
  readonly status: ConsentStatus;
  readonly permissions: readonly Permission[];
  readonly createdAt: string;
  readonly statusUpdatedAt: string;
  readonly expiresAt: string;
}

export interface SharedResourceInput {
  /** The consent the presented access token is bound to. */
  readonly consentId: string;
}

export interface SharedAccountDto {
  readonly accountId: string;
  readonly type: AccountType;
  readonly brandName: string;
  readonly companyCnpj: string;
  readonly compeCode: string;
  readonly branchCode: string;
  readonly number: string;
  readonly checkDigit: string;
}

export interface SharedAccountsOutput {
  readonly accounts: readonly SharedAccountDto[];
}

export interface ListSharedTransactionsInput extends SharedResourceInput {
  readonly accountId: string;
  readonly fromBookingDate: Date | null;
  readonly toBookingDate: Date | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface SharedTransactionDto {
  readonly transactionId: string;
  readonly status: EntryStatus;
  readonly type: EntryType;
  readonly transactionName: string;
  /** Signed cents; the presenter writes the specification's decimal string. */
  readonly amountInCents: number;
  readonly bookedAt: string;
  readonly merchantCategoryCode: number | null;
  readonly payeeDocument: string | null;
}

export interface SharedTransactionsOutput {
  readonly transactions: readonly SharedTransactionDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalRecords: number;
  readonly totalPages: number;
}
