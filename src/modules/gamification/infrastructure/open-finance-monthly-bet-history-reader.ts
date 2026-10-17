import type { SummariseSpendByMonth } from '@modules/open-finance/index.js';
import type {
  MonthlyBetHistory,
  MonthlyBetHistoryReader,
} from '../application/ports/monthly-bet-history-reader.port.js';

/**
 * The seam between `gamification` and `open-finance`. It reads the charts' own
 * use case rather than a parallel query, so a month inside the ceiling on the
 * goals screen is the same figure `/transactions/insights` draws — net of
 * refunds, following the classification, bucketed in São Paulo months.
 */
export class OpenFinanceMonthlyBetHistoryReader implements MonthlyBetHistoryReader {
  constructor(private readonly summariseSpendByMonth: SummariseSpendByMonth) {}

  async recentMonths(userId: string, months: number): Promise<MonthlyBetHistory> {
    const summary = await this.summariseSpendByMonth.execute({ userId, months });

    if (!summary.ok) {
      throw new Error(`Monthly summary unavailable: ${summary.error.code}`);
    }

    return {
      syncStatus: summary.value.syncStatus,
      months: summary.value.items.map((month) => ({
        monthKey: month.monthKey,
        spentInCents: month.totals.BETS,
      })),
    };
  }
}
