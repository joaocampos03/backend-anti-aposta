import type { TransactionCategory } from '../../domain/transaction-attributes.js';

/**
 * One month, one bucket, and the signed sum of everything in it. The use case
 * turns the sign into a magnitude; the query stays arithmetic.
 */
export interface MonthlyBucketTotal {
  readonly monthKey: string;
  readonly bucket: TransactionCategory;
  readonly netAmountInCents: number;
}

export interface MonthlySpendQuery {
  /**
   * The `BETS` bucket follows the **classification**, not the category a
   * transaction was filed under at ingestion. A row the chain calls a bet
   * counts there whatever its category; a row filed as betting that its owner
   * has corrected leaves the series entirely.
   *
   * That is what makes the charts agree with the statement per calendar month,
   * and what makes a correction change both rather than one.
   */
  totalsByMonth(userId: string, from: Date): Promise<readonly MonthlyBucketTotal[]>;
}
