import type { PrismaBetDayQuery } from '@modules/open-finance/index.js';
import type { Calendar } from '@shared/domain/calendar.js';
import type { BetDayReader } from '../application/ports/bet-day-reader.port.js';
import type { BetDay } from '../domain/bet-day.js';

/**
 * The seam between `gamification` and `open-finance` for the streaks. Days are
 * bucketed in the calendar's own time zone — São Paulo, never the server's — so
 * a bet at 23:30 belongs to the day it was placed on.
 */
export class OpenFinanceBetDayReader implements BetDayReader {
  constructor(
    private readonly query: PrismaBetDayQuery,
    private readonly calendar: Calendar,
  ) {}

  async betDaysSince(userId: string, from: Date): Promise<readonly BetDay[]> {
    const entries = await this.query.firstBetOfEachDaySince(userId, from, this.calendar.timeZone);

    return entries.map((entry) => ({
      dayKey: entry.dayKey,
      counterparty: entry.counterparty,
      matchedBy: entry.matchedBy,
    }));
  }
}
