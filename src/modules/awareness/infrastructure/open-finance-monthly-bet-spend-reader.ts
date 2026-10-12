import type { PrismaMonthlyBetSpendQuery } from '@modules/open-finance/index.js';
import type { MonthlyBetSpendReader } from '../application/ports/monthly-bet-spend-reader.port.js';

/** The seam between `awareness` and `open-finance`. */
export class OpenFinanceMonthlyBetSpendReader implements MonthlyBetSpendReader {
  constructor(private readonly query: PrismaMonthlyBetSpendQuery) {}

  async betSpendByMonth(
    userId: string,
    monthKeys: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    return await this.query.betSpendByMonth(userId, monthKeys);
  }
}
