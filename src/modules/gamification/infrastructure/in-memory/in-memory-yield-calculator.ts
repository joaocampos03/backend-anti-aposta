import type { YieldCalculator } from '../../application/ports/yield-calculator.port.js';

const PERCENT = 100;

/**
 * A fixed rate, so a test asserts on arithmetic it can do in its head. The real
 * adapter reads the rate `awareness` holds.
 */
export class FixedRateYieldCalculator implements YieldCalculator {
  constructor(private readonly ratePercent: number) {}

  futureValueInCents(amountInCents: number): number {
    return Math.round(amountInCents * (1 + this.ratePercent / PERCENT));
  }

  annualRatePercent(): number {
    return this.ratePercent;
  }
}
