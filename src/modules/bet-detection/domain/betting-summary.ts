import type { Calendar, DayKey } from '@shared/domain/calendar.js';
import type { BetEntry } from './bet-entry.js';
import { BettingCost } from './betting-cost.js';
import { BookmakerStanding } from './bookmaker-standing.js';
import { DetectionTally } from './detection-tally.js';
import { HourBucket } from './hour-bucket.js';

/**
 * The window every figure on the screen describes: whole calendar days ending
 * today, in São Paulo.
 *
 * Days rather than a calendar month, on purpose: a month would make the
 * headline jump on the first for reasons nobody asked about.
 */
export class BetWindow {
  private constructor(
    readonly days: number,
    readonly fromDayKey: DayKey,
    readonly toDayKey: DayKey,
    readonly startsAt: Date,
  ) {}

  /** `days` counts today, so a 30-day window starts 29 days ago. */
  static of(days: number, now: Date, calendar: Calendar): BetWindow {
    const startsAt = calendar.startOfDaysBefore(now, days - 1);

    return new BetWindow(days, calendar.dayKeyOf(startsAt), calendar.dayKeyOf(now), startsAt);
  }
}

/**
 * Everything the betting screen shows about one window, computed on read.
 *
 * One window drives every section. The cost, the ranking, the tallies and the
 * hours are all derived from the **same** list of entries, which is the only
 * way the screen's sections cannot come to disagree with each other — and the
 * list is the same set the statement reports for the same window, which is why
 * the hero figure matches the one on `/transactions`.
 *
 * @see docs/features/bets.md
 */
export class BettingSummary {
  private constructor(
    readonly window: BetWindow,
    readonly cost: BettingCost,
    readonly bookmakers: readonly BookmakerStanding[],
    readonly detectionTallies: readonly DetectionTally[],
    readonly hourBuckets: readonly HourBucket[],
  ) {}

  static of(input: {
    readonly window: BetWindow;
    readonly entries: readonly BetEntry[];
    readonly calendar: Calendar;
  }): BettingSummary {
    return new BettingSummary(
      input.window,
      BettingCost.from(input.entries),
      BookmakerStanding.rank(input.entries),
      DetectionTally.of(input.entries),
      HourBucket.distribute(BettingSummary.localHoursOf(input.entries, input.calendar)),
    );
  }

  /** The shape a reader with no consent and a reader with no bets both get. */
  static empty(window: BetWindow): BettingSummary {
    return new BettingSummary(window, BettingCost.empty(), [], [], HourBucket.distribute([]));
  }

  /** Bets **placed**, at the hour a clock in São Paulo showed when they were. */
  private static localHoursOf(
    entries: readonly BetEntry[],
    calendar: Calendar,
  ): readonly number[] {
    return entries
      .filter((entry) => entry.isBetPlaced)
      .map((entry) => calendar.hourOf(entry.occurredAt));
  }
}
