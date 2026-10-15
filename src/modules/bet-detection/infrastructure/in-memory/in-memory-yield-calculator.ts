import type { ReframedAmount, YieldCalculator } from '../../application/ports/yield-calculator.port.js';

const PERCENT = 100;

/**
 * A fixed rate, so a test asserts on arithmetic it can do in its head. The real
 * adapter reads the rate `awareness` holds.
 */
export class FixedRateYieldCalculator implements YieldCalculator {
  constructor(private readonly annualRatePercent: number) {}

  reframe(amountInCents: number): ReframedAmount {
    return {
      futureValueInCents: Math.round(
        Math.abs(amountInCents) * (1 + this.annualRatePercent / PERCENT),
      ),
      annualRatePercent: this.annualRatePercent,
    };
  }
}
