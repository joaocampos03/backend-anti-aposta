/** What `awareness` answers: the reframing of one amount, and the rate it used. */
export interface ReframedAmount {
  readonly futureValueInCents: number;
  readonly annualRatePercent: number;
}

export interface YieldCalculator {
  reframe(amountInCents: number): ReframedAmount;
}
