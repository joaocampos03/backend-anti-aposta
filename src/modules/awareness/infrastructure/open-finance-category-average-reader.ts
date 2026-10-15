import type { PrismaCategorySpendQuery } from '@modules/open-finance/index.js';
import type {
  CategoryAverageReader,
  CategoryMonthlyAverages,
} from '../application/ports/category-average-reader.port.js';
import {
  OWN_SPENDING_CATEGORIES,
  type OwnSpendingCategory,
} from '../domain/spending-equivalence.js';

/**
 * The seam between `awareness` and `open-finance`: that context totals its own
 * rows, and this one turns the totals into the averages the equivalences divide
 * by.
 *
 * The categories are picked out by name from this context's own list rather
 * than taken as given, so a category `open-finance` adds tomorrow cannot appear
 * in an equivalence nobody decided to show.
 */
export class OpenFinanceCategoryAverageReader implements CategoryAverageReader {
  constructor(private readonly spend: PrismaCategorySpendQuery) {}

  async averagesOverMonths(
    userId: string,
    monthKeys: readonly string[],
  ): Promise<CategoryMonthlyAverages> {
    const totals = await this.spend.totalsOverMonths(userId, monthKeys);

    if (totals.completeMonthsCounted === 0) {
      return { completeMonthsCounted: 0, averageInCentsByCategory: new Map() };
    }

    return {
      completeMonthsCounted: totals.completeMonthsCounted,
      averageInCentsByCategory: this.averagesFrom(
        totals.spentInCentsByCategory,
        totals.completeMonthsCounted,
      ),
    };
  }

  private averagesFrom(
    spent: ReadonlyMap<string, number>,
    months: number,
  ): ReadonlyMap<OwnSpendingCategory, number> {
    const averages = new Map<OwnSpendingCategory, number>();

    for (const category of OWN_SPENDING_CATEGORIES) {
      const total = spent.get(category) ?? 0;
      averages.set(category, Math.round(total / months));
    }

    return averages;
  }
}
