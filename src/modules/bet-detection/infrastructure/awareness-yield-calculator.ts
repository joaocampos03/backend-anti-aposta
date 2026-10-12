import type { AmountReframing } from '@modules/awareness/index.js';
import type { ReframedAmount, YieldCalculator } from '../application/ports/yield-calculator.port.js';

/** The seam between `bet-detection` and `awareness`. */
export class AwarenessYieldCalculator implements YieldCalculator {
  constructor(private readonly reframing: AmountReframing) {}

  reframe(amountInCents: number): ReframedAmount {
    return this.reframing.reframe(amountInCents);
  }
}
