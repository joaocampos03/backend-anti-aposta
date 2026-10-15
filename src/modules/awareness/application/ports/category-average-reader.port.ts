import type { OwnSpendingCategory } from '../../domain/spending-equivalence.js';

export interface CategoryMonthlyAverages {
  /**
   * How many of the months asked for this person actually has history in. It
   * is the denominator of every average here, and it travels with them so the
   * detail line can say what the figure covers.
   */
  readonly completeMonthsCounted: number;
  /** Average monthly magnitude per category, over those months. */
  readonly averageInCentsByCategory: ReadonlyMap<OwnSpendingCategory, number>;
}

/**
 * What `awareness` asks `open-finance` for: what this person spends per month,
 * by category, over whole months only.
 *
 * The months are named by this context and answered by that one, so both ends
 * agree on which calendar they mean. A transaction classified as a bet never
 * counts towards another category's average, exactly as on the charts — a
 * betting total compared against an average that included betting would be
 * comparing the money with itself.
 */
export interface CategoryAverageReader {
  averagesOverMonths(
    userId: string,
    monthKeys: readonly string[],
  ): Promise<CategoryMonthlyAverages>;
}
