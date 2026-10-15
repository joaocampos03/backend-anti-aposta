import type {
  CategoryAverageReader,
  CategoryMonthlyAverages,
} from '../../application/ports/category-average-reader.port.js';
import type { OwnSpendingCategory } from '../../domain/spending-equivalence.js';

export class InMemoryCategoryAverageReader implements CategoryAverageReader {
  private completeMonths = 0;
  private averages: ReadonlyMap<OwnSpendingCategory, number> = new Map();

  /**
   * Arrange: what this person spends per month, and over how many complete
   * months that average was taken.
   */
  record(input: {
    readonly completeMonths: number;
    readonly averages: readonly (readonly [OwnSpendingCategory, number])[];
  }): void {
    this.completeMonths = input.completeMonths;
    this.averages = new Map(input.averages);
  }

  async averagesOverMonths(
    _userId: string,
    _monthKeys: readonly string[],
  ): Promise<CategoryMonthlyAverages> {
    return {
      completeMonthsCounted: this.completeMonths,
      averageInCentsByCategory: this.averages,
    };
  }
}
