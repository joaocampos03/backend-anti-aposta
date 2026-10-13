/** What `awareness` answers. The rate travels with the figure it produced. */
export interface ReframedAmount {
  readonly futureValueInCents: number;
  readonly annualRatePercent: number;
}

export interface YieldCalculator {
  reframe(amountInCents: number): ReframedAmount;
}
