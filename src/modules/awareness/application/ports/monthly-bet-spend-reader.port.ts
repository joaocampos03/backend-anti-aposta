/**
 * What `awareness` asks `open-finance` for: how much each calendar month cost
 * in bets. It is a synchronous query this context cannot proceed without, and
 * it is answered through `open-finance`'s public API rather than by reaching
 * into its tables.
 */
export interface MonthlyBetSpendReader {
  /** Keyed by month; a month with no betting may be absent rather than zero. */
  betSpendByMonth(
    userId: string,
    monthKeys: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;
}
