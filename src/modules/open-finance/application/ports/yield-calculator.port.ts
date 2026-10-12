/** What `awareness` answers. The reframing travels with the amount it reframes. */
export interface ReframedAmount {
  readonly futureValueInCents: number;
  readonly annualRatePercent: number;
}

export interface YieldCalculator {
  reframe(amountInCents: number): ReframedAmount;
}
