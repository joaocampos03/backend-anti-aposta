import type { MonthlyBetSpendReader } from '../../application/ports/monthly-bet-spend-reader.port.js';

export class InMemoryMonthlyBetSpendReader implements MonthlyBetSpendReader {
  readonly spendByUser = new Map<string, Map<string, number>>();

  /** Arrange: "this user spent this much in this month". */
  record(userId: string, monthKey: string, betSpendInCents: number): void {
    const months = this.spendByUser.get(userId) ?? new Map<string, number>();
    months.set(monthKey, betSpendInCents);
    this.spendByUser.set(userId, months);
  }

  async betSpendByMonth(
    userId: string,
    monthKeys: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const months = this.spendByUser.get(userId) ?? new Map<string, number>();

    return new Map(
      monthKeys
        .filter((monthKey) => months.has(monthKey))
        .map((monthKey) => [monthKey, months.get(monthKey) ?? 0]),
    );
  }
}
