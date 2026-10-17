import type {
  MonthlyBetHistory,
  MonthlyBetHistoryReader,
} from '../../application/ports/monthly-bet-history-reader.port.js';

/** The statement as a test arranges it: one history for every caller. */
export class InMemoryMonthlyBetHistoryReader implements MonthlyBetHistoryReader {
  constructor(public history: MonthlyBetHistory = { syncStatus: 'NO_CONSENT', months: [] }) {}

  async recentMonths(): Promise<MonthlyBetHistory> {
    return this.history;
  }
}
