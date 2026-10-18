import type { DayKey, MonthKey } from '@shared/domain/calendar.js';
import type { CeilingCycle, MonthlyBetSpend } from './ceiling-cycle.js';
import type { StreakRecord } from './streak-record.js';

const MONTHS_IN_A_YEAR = 12;

/** What produced a family's figure, so an earned badge shows a fact instead of a congratulation. */
export type AttainmentEvidence =
  | { readonly kind: 'CURRENT_STREAK'; readonly days: number; readonly startsBeforeWindow: boolean }
  | {
      readonly kind: 'CLOSED_STREAK';
      readonly days: number;
      readonly firstDayKey: DayKey;
      readonly lastDayKey: DayKey;
      readonly startsBeforeWindow: boolean;
    }
  | { readonly kind: 'MONTH_RUN'; readonly months: number; readonly lastMonthKey: MonthKey }
  | { readonly kind: 'REACHED_GOALS'; readonly count: number; readonly titles: readonly string[] };

/** One family's figure. `evidence` is `null` exactly while the figure is zero. */
export interface Attainment {
  readonly value: number;
  readonly evidence: AttainmentEvidence | null;
}

/** Savings goals ever reached, newest first. Self-reported: as right as what was logged. */
export interface ReachedGoals {
  readonly count: number;
  readonly titles: readonly string[];
}

interface RunMonth {
  readonly monthKey: MonthKey;
  readonly qualifies: boolean;
}

interface MonthRun {
  readonly length: number;
  /** The newest month of the run, which is the month it ran up to. */
  readonly lastMonthKey: MonthKey | null;
}

const NOTHING: Attainment = { value: 0, evidence: null };

/**
 * The one figure each badge family is measured in. Pure, and given everything it
 * measures — the use case is the only place that knows where the numbers come
 * from, so a badge cannot claim something the statement contradicts.
 */
export class BadgeAttainment {
  private constructor() {}

  /**
   * The longest stretch the window holds, **counting the one under way**:
   * somebody forty days in has earned the thirty-day badge, and only finished
   * stretches are in the record.
   */
  static ofStreak(record: StreakRecord): Attainment {
    const { current, longest } = record;

    if (longest === null || current.days > longest.lengthInDays) {
      return current.days === 0
        ? NOTHING
        : {
            value: current.days,
            evidence: { kind: 'CURRENT_STREAK', days: current.days, startsBeforeWindow: current.startsBeforeWindow },
          };
    }

    return {
      value: longest.lengthInDays,
      evidence: {
        kind: 'CLOSED_STREAK',
        days: longest.lengthInDays,
        firstDayKey: longest.firstDayKey,
        lastDayKey: longest.lastDayKey,
        startsBeforeWindow: longest.startsBeforeWindow,
      },
    };
  }

  /** Closed cycles only, newest first. A month with no cycle breaks the run. */
  static ofCeiling(cycles: readonly CeilingCycle[]): Attainment {
    return fromRun(
      longestMonthRun(
        cycles
          .filter((cycle) => !cycle.isOpen)
          .map((cycle) => ({ monthKey: cycle.monthKey, qualifies: cycle.status === 'REACHED' })),
      ),
    );
  }

  /**
   * Closed months with data, newest first, each compared with the calendar month
   * right before it. A month whose predecessor has no data cannot fall from it.
   */
  static ofReduction(closedMonths: readonly MonthlyBetSpend[]): Attainment {
    return fromRun(
      longestMonthRun(
        closedMonths.map((month, index) => {
          const before = closedMonths[index + 1];

          return {
            monthKey: month.monthKey,
            qualifies:
              before !== undefined &&
              isMonthJustBefore(before.monthKey, month.monthKey) &&
              month.spentInCents < before.spentInCents,
          };
        }),
      ),
    );
  }

  static ofSavings(reached: ReachedGoals): Attainment {
    if (reached.count === 0) {
      return NOTHING;
    }

    return { value: reached.count, evidence: { kind: 'REACHED_GOALS', count: reached.count, titles: reached.titles } };
  }
}

function fromRun(run: MonthRun): Attainment {
  if (run.lastMonthKey === null) {
    return NOTHING;
  }

  return { value: run.length, evidence: { kind: 'MONTH_RUN', months: run.length, lastMonthKey: run.lastMonthKey } };
}

/**
 * The longest stretch of **adjacent** qualifying months. Adjacency matters:
 * treating a gap as continuous would invent a run that never happened.
 */
function longestMonthRun(newestFirst: readonly RunMonth[]): MonthRun {
  let best: MonthRun = { length: 0, lastMonthKey: null };
  let length = 0;
  let runNewest: MonthKey | null = null;
  let previous: MonthKey | null = null;

  for (const month of newestFirst) {
    if (!month.qualifies) {
      previous = null;
      continue;
    }

    const continues = previous !== null && isMonthJustBefore(month.monthKey, previous);

    length = continues ? length + 1 : 1;
    if (!continues) runNewest = month.monthKey;
    previous = month.monthKey;

    if (length > best.length) best = { length, lastMonthKey: runNewest };
  }

  return best;
}

function isMonthJustBefore(earlier: MonthKey, later: MonthKey): boolean {
  return monthIndexOf(later) - monthIndexOf(earlier) === 1;
}

function monthIndexOf(monthKey: MonthKey): number {
  const [year = 0, month = 0] = monthKey.split('-').map(Number);

  return year * MONTHS_IN_A_YEAR + month;
}
