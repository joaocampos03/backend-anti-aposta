import type { SyncStatus } from '../../domain/consent.js';
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
import type { LedgerType } from '../ports/transaction-ledger.query.port.js';

/**
 * The 180- and 360-day windows exist so "Ver no extrato" on the betting screen
 * opens the **same** slice the figure above it described. A link that widened
 * the period would show a different total for the same sentence.
 */
export type LedgerPeriod =
  | 'LAST_30_DAYS'
  | 'LAST_90_DAYS'
  | 'LAST_180_DAYS'
  | 'LAST_360_DAYS'
  | 'ALL_TIME';

export interface ListTransactionsInput {
  readonly userId: string;
  readonly type: LedgerType;
  readonly period: LedgerPeriod;
  readonly accountId: string | null;
  /** One house's rows, debits and refunds alike. From `GET /bets/summary`. */
  readonly bookmakerId: string | null;
  readonly search: string | null;
  readonly limit: number;
  readonly cursor: { readonly occurredAt: string; readonly id: string } | null;
}

export interface MoneyDto {
  readonly amountInCents: number;
  readonly currency: 'BRL';
}

export interface BetDto {
  readonly matchedBy: BetMarkReason;
  readonly confidence: BetMarkConfidence;
  readonly source: BetMarkSource;
}

export interface OverrideDto {
  readonly verdict: 'NOT_A_BET';
  readonly overriddenAt: string;
  readonly isReversible: boolean;
}

export interface TransactionDto {
  readonly id: string;
  readonly occurredAt: string;
  /** São Paulo calendar keys. The client never re-derives a day from an instant. */
  readonly dayKey: string;
  readonly monthKey: string;
  readonly counterparty: string;
  readonly category: TransactionCategory;
  readonly method: PaymentMethod;
  readonly status: TransactionStatus;
  readonly amount: MoneyDto;
  readonly accountId: string;
  /** `null` rather than absent, so a row's shape is stable. */
  readonly bet: BetDto | null;
  readonly yieldEquivalent: MoneyDto | null;
  /**
   * Present when the person has corrected this row, so the dialog can offer to
   * undo it. An addition to the documented row shape: without it the corrected
   * state the handoff asks for has nothing to render from.
   */
  readonly override: OverrideDto | null;
}

/** The figures for the **whole matching set**, which is why they sit beside the rows. */
export interface LedgerTotalsDto {
  readonly credits: MoneyDto;
  readonly debits: MoneyDto;
  readonly betSpend: MoneyDto;
  readonly betCount: number;
  readonly betYieldEquivalent: MoneyDto;
  readonly annualRatePercent: number;
}

export interface ListTransactionsOutput {
  readonly syncStatus: SyncStatus;
  readonly lastSyncedAt: string | null;
  readonly totals: LedgerTotalsDto;
  readonly items: readonly TransactionDto[];
  readonly nextCursor: { readonly occurredAt: string; readonly id: string } | null;
}
