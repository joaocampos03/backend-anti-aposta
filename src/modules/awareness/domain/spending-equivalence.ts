import { Money } from '@shared/domain/money.js';
import type { ReferenceItem } from './reference-item.js';

/**
 * The reader's own categories, in the order the card lists them.
 *
 * The union is restated here rather than imported from `open-finance`: a
 * projection owns its own shape, and if that context ever adds a category, this
 * list failing to compile is where somebody decides whether an amount should be
 * expressible in months of it.
 */
export const OWN_SPENDING_CATEGORIES = [
  'GROCERIES',
  'HOUSING',
  'DINING',
  'TRANSPORT',
  'SUBSCRIPTIONS',
] as const;

export type OwnSpendingCategory = (typeof OWN_SPENDING_CATEGORIES)[number];

/**
 * A betting total expressed in whole months of what this person actually spends
 * on something else.
 *
 * It invents nothing: the average is theirs, over **complete** months only, and
 * the figure says how many months it covers so the detail line can stay honest
 * about it. Including the current partial month would deflate the average and
 * inflate every "N meses de mercado" on the screen.
 */
export class OwnSpendingEquivalence {
  private constructor(
    readonly category: OwnSpendingCategory,
    readonly months: number,
    readonly monthlyAverage: Money,
    readonly completeMonthsCounted: number,
  ) {}

  /** `null` when it does not reach one whole month: no quantity is written down. */
  static of(input: {
    readonly category: OwnSpendingCategory;
    readonly total: Money;
    readonly monthlyAverage: Money;
    readonly completeMonthsCounted: number;
  }): OwnSpendingEquivalence | null {
    if (input.monthlyAverage.amountInCents <= 0 || input.completeMonthsCounted <= 0) {
      return null;
    }

    const months = Math.floor(
      input.total.absolute().amountInCents / input.monthlyAverage.amountInCents,
    );

    if (months < 1) {
      return null;
    }

    return new OwnSpendingEquivalence(
      input.category,
      months,
      input.monthlyAverage,
      input.completeMonthsCounted,
    );
  }
}

/**
 * A betting total expressed as a quantity of a catalogue item, with the target
 * a savings goal for it would have.
 *
 * `target` is `quantity × unitPrice` and nothing else. The card offers to open
 * a goal for exactly the amount it just named, because a goal for a different
 * number than the one on the card would be a lie of its own.
 */
export class ReferencePriceEquivalence {
  private constructor(
    readonly item: ReferenceItem,
    readonly quantity: number,
    readonly target: Money,
  ) {}

  /** `null` below one whole unit, so the card never lists "0 carros". */
  static of(item: ReferenceItem, total: Money): ReferencePriceEquivalence | null {
    const quantity = item.quantityFor(total);

    if (quantity < 1) {
      return null;
    }

    return new ReferencePriceEquivalence(
      item,
      quantity,
      Money.restore(quantity * item.unitPrice.amountInCents, item.unitPrice.currency),
    );
  }
}
