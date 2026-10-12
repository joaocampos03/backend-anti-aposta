import type { Result } from '@shared/domain/result.js';
import type {
  AccountKind,
  PaymentMethod,
  TransactionStatus,
} from '../../domain/transaction-attributes.js';

/**
 * The institution that holds the data, as this context needs to see it.
 *
 * Everything here is already in **our** words. The adapter behind this port is
 * the anti-corruption layer: it speaks the Open Finance Brasil wire format
 * (`creditDebitType`, `transactionAmount`, `merchantCategoryCode`…) over HTTP
 * and translates, and no field name of the specification travels past it.
 */
export interface DataHolder {
  /** Registers the request at the institution, which answers with its own id. */
  createConsent(input: {
    readonly expiresAt: Date;
  }): Promise<Result<{ readonly externalConsentId: string }, DataHolderFailure>>;

  /** Where to send the person to say yes or no. */
  authorisationUrl(input: {
    readonly externalConsentId: string;
    readonly state: string;
    readonly codeChallenge: string;
  }): string;

  exchangeCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<Result<DataHolderTokens, DataHolderFailure>>;

  refresh(refreshToken: string): Promise<Result<DataHolderTokens, DataHolderFailure>>;

  listAccounts(accessToken: string): Promise<Result<readonly SharedAccount[], DataHolderFailure>>;

  /** Every page of one account's statement inside the window, already translated. */
  listTransactions(input: {
    readonly accessToken: string;
    readonly account: { readonly externalId: string; readonly kind: AccountKind };
    readonly from: Date;
    readonly to: Date;
  }): Promise<Result<readonly SharedTransaction[], DataHolderFailure>>;

  revokeConsent(externalConsentId: string): Promise<Result<void, DataHolderFailure>>;
}

/**
 * `REFUSED` — the institution understood and said no (a spent code, a revoked
 * consent). `UNAVAILABLE` — it could not be reached or answered nonsense.
 */
export type DataHolderFailure = 'REFUSED' | 'UNAVAILABLE';

export interface DataHolderTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: Date;
}

export interface SharedAccount {
  readonly externalId: string;
  readonly institution: string;
  readonly shortName: string;
  readonly product: string;
  /**
   * In full, as the specification sends it. It is masked by `ConnectedAccount`
   * before anything is stored, and goes no further than that.
   */
  readonly fullNumber: string;
  readonly kind: AccountKind;
}

export interface SharedTransaction {
  readonly externalId: string;
  readonly occurredAt: Date;
  /** Signed cents: negative left the account. */
  readonly amountInCents: number;
  /**
   * The raw line the institution printed. It is held in memory for the length
   * of one synchronisation, handed to `bet-detection`, and never stored here.
   */
  readonly statementLine: string;
  readonly method: PaymentMethod;
  readonly status: TransactionStatus;
  readonly merchantCategoryCode: number | null;
  readonly counterpartyDocument: string | null;
}
