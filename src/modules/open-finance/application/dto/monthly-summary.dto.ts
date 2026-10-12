import type { SyncStatus } from '../../domain/consent.js';
import type { TransactionCategory } from '../../domain/transaction-attributes.js';

export interface SummariseSpendByMonthInput {
  readonly userId: string;
  readonly months: number;
}

export interface MonthlyTotalsDto {
  readonly monthKey: string;
  readonly monthsAgo: number;
  /** The current month is incomplete by definition. */
  readonly isPartial: boolean;
  /** Every category key, zeros included, as non-negative magnitudes. */
  readonly totals: Readonly<Record<TransactionCategory, number>>;
}

export interface MonthlySummaryOutput {
  readonly syncStatus: SyncStatus;
  /**
   * Declared once for the whole response rather than wrapping 120 integers in
   * objects. The one documented departure from the money convention, and the
   * reason the field exists.
   */
  readonly currency: 'BRL';
  readonly items: readonly MonthlyTotalsDto[];
  readonly nextCursor: null;
}
