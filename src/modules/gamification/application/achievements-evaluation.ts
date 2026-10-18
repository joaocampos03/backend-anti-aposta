import type { Clock } from '@shared/application/clock.port.js';
import type { Calendar, DayKey } from '@shared/domain/calendar.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BadgeAttainment } from '../domain/badge-attainment.js';
import type { FamilyAttainments } from '../domain/badge-collection.js';
import type { BettingCeilingRepository } from '../domain/betting-ceiling.repository.js';
import { CeilingCycle, type MonthlyBetSpend } from '../domain/ceiling-cycle.js';
import { StreakRecord } from '../domain/streak-record.js';
import { CEILING_WINDOW_IN_MONTHS } from './describe-betting-ceiling.use-case.js';
import type { BetDayReader } from './ports/bet-day-reader.port.js';
import type { MonthlyBetHistoryReader, StatementReadiness } from './ports/monthly-bet-history-reader.port.js';
import type { ReachedGoalsReader } from './ports/reached-goals-reader.port.js';

/** A list a person can check at a glance; the count says how many more there are. */
export const REACHED_GOAL_TITLE_LIMIT = 3;

export interface AchievementsMeasurement {
  readonly syncStatus: StatementReadiness;
  readonly todayKey: DayKey;
  /** `null` unless the statement is ready: no consent is not a streak of zero. */
  readonly streak: StreakRecord | null;
  /** Only the families that could be measured now. */
  readonly attainments: FamilyAttainments;
}

export interface AchievementsEvaluationDependencies {
  readonly history: MonthlyBetHistoryReader;
  readonly betDays: BetDayReader;
  readonly ceilings: BettingCeilingRepository;
  readonly reachedGoals: ReachedGoalsReader;
  readonly calendar: Calendar;
  readonly clock: Clock;
}

/**
 * Measures everything the badges are counted in, from the same sources the
 * other screens read: the charts' own monthly figures, the ceiling the person
 * chose, the savings ledger, and the bet days of the statement. Shared by the
 * screen and by the reactions to the events that can change a figure, so a
 * badge is awarded on the same arithmetic the screen shows.
 */
export class AchievementsEvaluation {
  constructor(private readonly dependencies: AchievementsEvaluationDependencies) {}

  async measure(userId: string): Promise<AchievementsMeasurement> {
    const now = this.dependencies.clock.now();
    const todayKey = this.dependencies.calendar.dayKeyOf(now);
    const history = await this.dependencies.history.recentMonths(userId, CEILING_WINDOW_IN_MONTHS);
    const savings = BadgeAttainment.ofSavings(
      await this.dependencies.reachedGoals.reachedGoalsOf(userId, REACHED_GOAL_TITLE_LIMIT),
    );

    if (history.syncStatus !== 'READY') {
      return { syncStatus: history.syncStatus, todayKey, streak: null, attainments: new Map([['SAVINGS', savings]]) };
    }

    const streak = await this.streakOf(userId, now);
    const closedMonths = this.closedMonths(history.months, now);

    return {
      syncStatus: 'READY',
      todayKey,
      streak,
      attainments: new Map([
        ['STREAK', BadgeAttainment.ofStreak(streak)],
        ['CEILING', BadgeAttainment.ofCeiling(await this.cyclesOf(userId, closedMonths, now))],
        ['REDUCTION', BadgeAttainment.ofReduction(closedMonths)],
        ['SAVINGS', savings],
      ]),
    };
  }

  private async streakOf(userId: string, now: Date): Promise<StreakRecord> {
    const window = this.windowEndingAt(now);
    const firstDayKey = window.at(-1) ?? this.dependencies.calendar.dayKeyOf(now);
    const betDays = await this.dependencies.betDays.betDaysSince(
      userId,
      this.dependencies.calendar.startOfDay(firstDayKey),
    );

    return StreakRecord.derive(window, betDays);
  }

  /**
   * Today back to the first day of the oldest month the charts draw, newest
   * first. The statement is read twelve months back, so every day in here is a
   * day we looked at.
   */
  private windowEndingAt(now: Date): readonly DayKey[] {
    const { calendar } = this.dependencies;
    const oldestMonth = calendar.recentMonthKeys(now, CEILING_WINDOW_IN_MONTHS).at(-1) ?? calendar.monthKeyOf(now);
    const firstDayKey = calendar.dayKeyOf(calendar.startOfMonth(oldestMonth));
    const days: DayKey[] = [];

    // `YYYY-MM-DD` keys order as strings in the order the days happened.
    for (let dayKey = calendar.dayKeyOf(now); dayKey >= firstDayKey; dayKey = calendar.dayKeyBefore(dayKey)) {
      days.push(dayKey);
    }

    return days;
  }

  /** The open month is half a month: a badge awarded on it could be undone by its last ten days. */
  private closedMonths(months: readonly MonthlyBetSpend[], now: Date): readonly MonthlyBetSpend[] {
    const current = this.dependencies.calendar.monthKeyOf(now);

    return months.filter((month) => month.monthKey !== current);
  }

  private async cyclesOf(
    userId: string,
    closedMonths: readonly MonthlyBetSpend[],
    now: Date,
  ): Promise<readonly CeilingCycle[]> {
    const ceiling = await this.dependencies.ceilings.findByUserId(UniqueEntityId.restore(userId));

    return ceiling === null
      ? []
      : CeilingCycle.measure(ceiling, closedMonths, this.dependencies.calendar.monthKeyOf(now));
  }
}
