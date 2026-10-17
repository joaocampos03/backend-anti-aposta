import type { MonthlyBetSpend } from '../../domain/ceiling-cycle.js';

export type StatementReadiness = 'NO_CONSENT' | 'SYNCING' | 'READY';

export interface MonthlyBetHistory {
  readonly syncStatus: StatementReadiness;
  /** Months with statement data only, newest first. A month with no data is absent, not zero. */
  readonly months: readonly MonthlyBetSpend[];
}

/**
 * What `gamification` asks `open-finance` for: the betting spend per São Paulo
 * calendar month — **the same figures the charts read**, so a month inside the
 * ceiling here is the same number on every other screen. A synchronous query
 * this context cannot answer without, through `open-finance`'s public API.
 */
export interface MonthlyBetHistoryReader {
  recentMonths(userId: string, months: number): Promise<MonthlyBetHistory>;
}
