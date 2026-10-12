import { Money } from '@shared/domain/money.js';
import {
  FIXED_INCOME_ANNUAL_RATE_PERCENT,
  YieldEquivalent,
} from '../domain/yield-equivalent.js';

export interface ReframedAmount {
  readonly futureValueInCents: number;
  readonly annualRatePercent: number;
}

/**
 * What `awareness` publishes to the rest of the monolith: one amount, reframed.
 *
 * It exists so the arithmetic has exactly one home. The frontend did this in
 * four places from a constant duplicated twice, which is how two screens came
 * to show different figures for the same money.
 */
export class AmountReframing {
  constructor(
    private readonly annualRatePercent: number = FIXED_INCOME_ANNUAL_RATE_PERCENT,
  ) {}

  reframe(amountInCents: number): ReframedAmount {
    const projected = YieldEquivalent.of(Money.restore(amountInCents), this.annualRatePercent);

    return {
      futureValueInCents: projected.futureValue.amountInCents,
      annualRatePercent: projected.annualRatePercent,
    };
  }
}
