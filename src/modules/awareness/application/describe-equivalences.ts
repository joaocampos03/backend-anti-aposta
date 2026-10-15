import type { Clock } from '@shared/application/clock.port.js';
import type { Calendar } from '@shared/domain/calendar.js';
import { Money } from '@shared/domain/money.js';
import type { ReferenceItemRepository } from '../domain/reference-item.repository.js';
import {
  OWN_SPENDING_CATEGORIES,
  OwnSpendingEquivalence,
  ReferencePriceEquivalence,
  type OwnSpendingCategory,
} from '../domain/spending-equivalence.js';
import type {
  EquivalencesOutput,
  OwnSpendingEquivalenceDto,
  ReferenceItemEquivalenceDto,
} from './dto/equivalences.dto.js';
import type { CategoryAverageReader } from './ports/category-average-reader.port.js';

/**
 * A year of history, of which the current month is partial and excluded. Twelve
 * months is what the charts cover, so the averages describe the same stretch
 * the rest of the product does.
 */
const AVERAGING_WINDOW_IN_MONTHS = 12;

export interface DescribeEquivalencesDependencies {
  readonly items: ReferenceItemRepository;
  readonly averages: CategoryAverageReader;
  readonly calendar: Calendar;
  readonly clock: Clock;
}

/**
 * What `awareness` publishes so an amount can be said in something other than
 * money.
 *
 * Both lists are divided out of the **real** total, in this one place. The
 * frontend did this arithmetic itself against a fixture that included the
 * current partial month, which inflated every "N meses de mercado" on the
 * screen.
 *
 * @see docs/features/bets.md
 */
export class DescribeEquivalences {
  constructor(private readonly dependencies: DescribeEquivalencesDependencies) {}

  async describe(input: {
    readonly userId: string;
    readonly totalInCents: number;
  }): Promise<EquivalencesOutput> {
    const total = Money.restore(input.totalInCents);

    if (total.isZero()) {
      return { ownSpending: [], referenceItems: [] };
    }

    const [ownSpending, referenceItems] = await Promise.all([
      this.ownSpendingFor(input.userId, total),
      this.referenceItemsFor(total),
    ]);

    return { ownSpending, referenceItems };
  }

  /**
   * In the declared category order, which is the order the card reads in. Only
   * categories that reach a whole month appear.
   */
  private async ownSpendingFor(
    userId: string,
    total: Money,
  ): Promise<readonly OwnSpendingEquivalenceDto[]> {
    const averages = await this.dependencies.averages.averagesOverMonths(
      userId,
      this.completeMonthKeys(),
    );

    return OWN_SPENDING_CATEGORIES.map((category) =>
      this.equivalenceFor(
        category,
        total,
        averages.averageInCentsByCategory.get(category) ?? 0,
        averages.completeMonthsCounted,
      ),
    ).filter((equivalence): equivalence is OwnSpendingEquivalenceDto => equivalence !== null);
  }

  private equivalenceFor(
    category: OwnSpendingCategory,
    total: Money,
    averageInCents: number,
    completeMonthsCounted: number,
  ): OwnSpendingEquivalenceDto | null {
    const equivalence = OwnSpendingEquivalence.of({
      category,
      total,
      monthlyAverage: Money.restore(averageInCents),
      completeMonthsCounted,
    });

    if (equivalence === null) {
      return null;
    }

    return {
      category: equivalence.category,
      months: equivalence.months,
      monthlyAverage: {
        amountInCents: equivalence.monthlyAverage.amountInCents,
        currency: equivalence.monthlyAverage.currency,
      },
      completeMonthsCounted: equivalence.completeMonthsCounted,
    };
  }

  private async referenceItemsFor(
    total: Money,
  ): Promise<readonly ReferenceItemEquivalenceDto[]> {
    const catalogue = await this.dependencies.items.findActiveByPriceDescending();

    return catalogue
      .map((item) => ReferencePriceEquivalence.of(item, total))
      .filter((equivalence): equivalence is ReferencePriceEquivalence => equivalence !== null)
      .map((equivalence) => ({
        id: equivalence.item.id,
        singular: equivalence.item.singular,
        plural: equivalence.item.plural,
        quantity: equivalence.quantity,
        unitPrice: {
          amountInCents: equivalence.item.unitPrice.amountInCents,
          currency: equivalence.item.unitPrice.currency,
        },
        target: {
          amountInCents: equivalence.target.amountInCents,
          currency: equivalence.target.currency,
        },
        reviewedAt: equivalence.item.reviewedAt,
      }));
  }

  /** The year behind us, without the month we are still living through. */
  private completeMonthKeys(): readonly string[] {
    const [, ...complete] = this.dependencies.calendar.recentMonthKeys(
      this.dependencies.clock.now(),
      AVERAGING_WINDOW_IN_MONTHS,
    );

    return complete;
  }
}
