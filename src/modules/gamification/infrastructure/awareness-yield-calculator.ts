import type { AmountReframing } from '@modules/awareness/index.js';
import type { YieldCalculator } from '../application/ports/yield-calculator.port.js';

/** The seam between `gamification` and `awareness`, which owns the rate and the arithmetic. */
export class AwarenessYieldCalculator implements YieldCalculator {
  constructor(private readonly reframing: AmountReframing) {}

  futureValueInCents(amountInCents: number): number {
    return this.reframing.reframe(amountInCents).futureValueInCents;
  }

  /** Reframing nothing is how `awareness` states its rate without a projection attached. */
  annualRatePercent(): number {
    return this.reframing.reframe(0).annualRatePercent;
  }
}
