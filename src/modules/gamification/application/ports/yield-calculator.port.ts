/**
 * What `awareness` answers: one amount reframed, and the rate it used. The rate
 * travels with every figure it produced — an unlabelled projection is a made-up
 * number.
 */
export interface YieldCalculator {
  futureValueInCents(amountInCents: number): number;
  annualRatePercent(): number;
}
