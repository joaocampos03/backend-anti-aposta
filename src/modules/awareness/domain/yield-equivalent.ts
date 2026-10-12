import { Money } from '@shared/domain/money.js';

/**
 * The rate `awareness` reframes with. It is configuration of this context and
 * nowhere else: the frontend computed it in four places from a constant
 * duplicated twice, which is how two screens came to disagree about the same
 * amount.
 */
export const FIXED_INCOME_ANNUAL_RATE_PERCENT = 11.4;

const PERCENT = 100;
const PROJECTION_IN_MONTHS = 12;

/**
 * What an amount would be worth after twelve months in fixed income. It carries
 * the rate it used, because an unlabelled projection is a made-up number, and it
 * is presented as an estimate and never as a guarantee of return.
 *
 * This is the arithmetic behind the product's System 2 claim, so it is required
 * coverage: a wrong number here discredits every screen that shows one.
 */
export class YieldEquivalent {
  private constructor(
    readonly futureValue: Money,
    readonly principal: Money,
    readonly annualRatePercent: number,
    readonly projectionInMonths: number,
  ) {}

  /**
   * The sign is dropped on the way in: reframing answers "this much money, had
   * it stayed invested", and a debit and a credit of the same size reframe to
   * the same figure.
   */
  static of(
    amount: Money,
    annualRatePercent: number = FIXED_INCOME_ANNUAL_RATE_PERCENT,
  ): YieldEquivalent {
    const principal = amount.absolute();
    const futureValue = Money.restore(
      Math.round(principal.amountInCents * (1 + annualRatePercent / PERCENT)),
      principal.currency,
    );

    return new YieldEquivalent(
      futureValue,
      principal,
      annualRatePercent,
      PROJECTION_IN_MONTHS,
    );
  }

  /** What the projection adds: the figure the copy calls "um rendimento de". */
  get gain(): Money {
    const gain = this.futureValue.minus(this.principal);

    if (!gain.ok) {
      throw new Error('A yield and its principal must share a currency');
    }

    return gain.value;
  }
}
