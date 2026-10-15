import type { DayKey } from '@shared/domain/calendar.js';
import type { Money } from '@shared/domain/money.js';

/**
 * Something a betting total can be divided into, at an approximate price.
 *
 * Seeded configuration rather than code: a price can be corrected, or an item
 * added, without a deploy. Its id is a slug rather than a generated id because
 * a person reads this table and writes its rows by hand.
 *
 * `source` and `reviewedAt` are not decoration. These are rounded estimates
 * chosen to make an amount legible, not researched figures, and a card that
 * cannot say where its prices came from or when they were last looked at is a
 * card that quietly goes stale.
 */
export class ReferenceItem {
  private constructor(
    readonly id: string,
    readonly singular: string,
    readonly plural: string,
    readonly unitPrice: Money,
    readonly source: string,
    readonly reviewedAt: DayKey,
  ) {}

  static of(input: {
    readonly id: string;
    readonly singular: string;
    readonly plural: string;
    readonly unitPrice: Money;
    readonly source: string;
    readonly reviewedAt: DayKey;
  }): ReferenceItem {
    return new ReferenceItem(
      input.id,
      input.singular,
      input.plural,
      input.unitPrice,
      input.source,
      input.reviewedAt,
    );
  }

  /**
   * How many whole ones the amount would have bought. Whole ones only: "2,7
   * passagens aéreas" is a number nobody can picture, and rounding it up would
   * overstate what the money was worth.
   */
  quantityFor(total: Money): number {
    if (this.unitPrice.amountInCents <= 0) {
      return 0;
    }

    return Math.floor(total.absolute().amountInCents / this.unitPrice.amountInCents);
  }
}
