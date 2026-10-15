import type { DescribeEquivalences } from '@modules/awareness/index.js';
import type {
  EquivalenceReader,
  SpendingEquivalencesView,
} from '../application/ports/equivalence-reader.port.js';

/**
 * The seam between `bet-detection` and `awareness`: this context has the total,
 * that one owns what an amount can honestly be said in.
 */
export class AwarenessEquivalenceReader implements EquivalenceReader {
  constructor(private readonly equivalences: DescribeEquivalences) {}

  async equivalencesFor(
    userId: string,
    totalInCents: number,
  ): Promise<SpendingEquivalencesView> {
    const described = await this.equivalences.describe({ userId, totalInCents });

    return {
      ownSpending: described.ownSpending.map((own) => ({
        category: own.category,
        months: own.months,
        monthlyAverageInCents: own.monthlyAverage.amountInCents,
        completeMonthsCounted: own.completeMonthsCounted,
      })),
      referenceItems: described.referenceItems.map((item) => ({
        id: item.id,
        singular: item.singular,
        plural: item.plural,
        quantity: item.quantity,
        unitPriceInCents: item.unitPrice.amountInCents,
        targetInCents: item.target.amountInCents,
        reviewedAt: item.reviewedAt,
      })),
    };
  }
}
