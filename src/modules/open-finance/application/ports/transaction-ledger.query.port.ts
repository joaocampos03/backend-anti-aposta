import type {
  BetMarkConfidence,
  BetMarkReason,
  BetMarkSource,
} from '../../domain/transaction.js';
import type {
  PaymentMethod,
  TransactionCategory,
  TransactionStatus,
} from '../../domain/transaction-attributes.js';

export type LedgerType = 'ALL' | 'BETS' | 'CREDITS' | 'DEBITS';

/** The position of the last row of a page: `(occurredAt, id)`, both descending. */
export interface LedgerCursor {
  readonly occurredAt: Date;
  readonly id: string;
}

export interface LedgerFilter {
  readonly userId: string;
  readonly type: LedgerType;
  /** `null` for the whole retained history. */
  readonly occurredFrom: Date | null;
  readonly accountId: string | null;
  readonly search: string | null;
}

export interface LedgerRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly counterparty: string;
  readonly category: TransactionCategory;
  readonly method: PaymentMethod;
  readonly status: TransactionStatus;
  readonly amountInCents: number;
  readonly accountId: string;
  readonly betMatchedBy: BetMarkReason | null;
  readonly betConfidence: BetMarkConfidence | null;
  readonly betSource: BetMarkSource | null;
  readonly overriddenAt: Date | null;
}

export interface LedgerPage {
  readonly rows: readonly LedgerRow[];
  readonly nextCursor: LedgerCursor | null;
}

/**
 * Raw figures for the **whole matching set**, never for a page. A total
 * computed over one page is a defect rather than an approximation: the hero
 * figure would change as the reader scrolls.
 */
export interface LedgerTotalsRow {
  readonly creditsInCents: number;
  readonly debitsInCents: number;
  /**
   * Debits to bookmakers minus credits from them. A refund gives the money
   * back, so it was never foregone and reframing it as a lost yield would be a
   * made-up number. Floored at zero by the caller.
   */
  readonly netBetSpendInCents: number;
  /** Bets placed. A refund is not a bet placed, so it is not counted here. */
  readonly betCount: number;
}

/**
 * A read model, not an aggregate: the statement is a query over one context's
 * own tables and hydrating five thousand aggregates to compute a sum would be
 * the wrong shape entirely.
 */
export interface TransactionLedgerQuery {
  page(filter: LedgerFilter, limit: number, cursor: LedgerCursor | null): Promise<LedgerPage>;
  totals(filter: LedgerFilter): Promise<LedgerTotalsRow>;
}
