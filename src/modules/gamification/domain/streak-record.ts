import type { DayKey } from '@shared/domain/calendar.js';
import type { BetDay } from './bet-day.js';

/** A stretch of whole bet-free days that a bet ended. */
export interface BetFreeStreak {
  /** A lower bound when `startsBeforeWindow`. */
  readonly lengthInDays: number;
  readonly firstDayKey: DayKey;
  readonly lastDayKey: DayKey;
  /** It reaches the oldest day we hold, so we know it ran at least this long — not when it began. */
  readonly startsBeforeWindow: boolean;
  /** The first bet of the day just after the stretch. Every closed stretch has one. */
  readonly endedBy: BetDay;
}

/** The stretch under way, in complete days: today is not over, so it is never counted. */
export interface CurrentStreak {
  readonly days: number;
  readonly hasBetToday: boolean;
  /** No bet anywhere in the window: the count is the least we can claim, not the whole of it. */
  readonly startsBeforeWindow: boolean;
  /** The most recent bet day in the window, or `null` when it holds none. */
  readonly lastBet: BetDay | null;
}

export interface RecordedDay {
  readonly dayKey: DayKey;
  readonly hasBet: boolean;
}

/** Positions in the window while walking it: 0 is today. */
interface Run {
  readonly newest: number;
  readonly oldest: number;
}

/**
 * The bet-free stretches in a window of São Paulo days, derived from the bet
 * days every time it is asked and never written down. A stored counter and the
 * transactions it counts are two things that can disagree, and the one a person
 * would believe is the counter.
 *
 * A bet-free day is a day we looked at and found nothing, which only holds
 * inside the window — so the window is part of the record, and a stretch that
 * runs off its far edge says so instead of claiming it started there.
 */
export class StreakRecord {
  private constructor(
    /** Newest first; the first is today. */
    private readonly window: readonly DayKey[],
    private readonly betDays: ReadonlyMap<DayKey, BetDay>,
    readonly current: CurrentStreak,
    /** Longest first, the newer first on a tie. The stretch touching today is not among them. */
    readonly closedStreaks: readonly BetFreeStreak[],
  ) {}

  /** `window` is newest first and starts at today; bet days outside it are ignored. */
  static derive(window: readonly DayKey[], betDays: readonly BetDay[]): StreakRecord {
    if (window.length === 0) {
      throw new Error('A streak record needs at least today in its window');
    }

    const inWindow = new Set(window);
    const byDay = new Map(
      betDays.filter((day) => inWindow.has(day.dayKey)).map((day) => [day.dayKey, day] as const),
    );

    return new StreakRecord(window, byDay, currentStreak(window, byDay), closedStreaks(window, byDay));
  }

  get longest(): BetFreeStreak | null {
    return this.closedStreaks[0] ?? null;
  }

  get windowDayCount(): number {
    return this.window.length;
  }

  get firstDayKey(): DayKey {
    return this.window.at(-1) ?? this.todayKey;
  }

  get todayKey(): DayKey {
    return this.window[0] ?? '';
  }

  get betDayCount(): number {
    return this.betDays.size;
  }

  get betFreeDayCount(): number {
    return this.window.length - this.betDays.size;
  }

  /** The most recent `count` days of the window, newest first, today included. */
  recentDays(count: number): readonly RecordedDay[] {
    return this.window.slice(0, count).map((dayKey) => ({ dayKey, hasBet: this.betDays.has(dayKey) }));
  }
}

function currentStreak(window: readonly DayKey[], betDays: ReadonlyMap<DayKey, BetDay>): CurrentStreak {
  const lastBetIndex = window.findIndex((dayKey) => betDays.has(dayKey));

  if (lastBetIndex === -1) {
    return { days: window.length - 1, hasBetToday: false, startsBeforeWindow: true, lastBet: null };
  }

  return {
    days: Math.max(0, lastBetIndex - 1),
    hasBetToday: lastBetIndex === 0,
    startsBeforeWindow: false,
    lastBet: betDays.get(window[lastBetIndex] ?? '') ?? null,
  };
}

/** Cuts the window, walked from today backwards, into maximal bet-free runs. */
function betFreeRuns(window: readonly DayKey[], betDays: ReadonlyMap<DayKey, BetDay>): readonly Run[] {
  const runs: Run[] = [];
  let newest: number | null = null;

  for (const [index, dayKey] of window.entries()) {
    if (!betDays.has(dayKey)) {
      newest ??= index;
      continue;
    }

    if (newest !== null) runs.push({ newest, oldest: index - 1 });
    newest = null;
  }

  if (newest !== null) runs.push({ newest, oldest: window.length - 1 });

  return runs;
}

/**
 * The bet that **ended** a stretch is the one on the day just after its newest
 * day — never the one the walk runs into at its oldest end, which is what ended
 * the stretch before it. Getting that backwards reads plausibly and is wrong by
 * one bet.
 */
function closedStreaks(
  window: readonly DayKey[],
  betDays: ReadonlyMap<DayKey, BetDay>,
): readonly BetFreeStreak[] {
  return betFreeRuns(window, betDays)
    .flatMap((run) => {
      const endedBy = run.newest === 0 ? undefined : betDays.get(window[run.newest - 1] ?? '');

      return endedBy === undefined ? [] : [toStreak(window, run, endedBy)];
    })
    .sort(
      (left, right) =>
        right.lengthInDays - left.lengthInDays || right.lastDayKey.localeCompare(left.lastDayKey),
    );
}

function toStreak(window: readonly DayKey[], run: Run, endedBy: BetDay): BetFreeStreak {
  return {
    lengthInDays: run.oldest - run.newest + 1,
    firstDayKey: window[run.oldest] ?? '',
    lastDayKey: window[run.newest] ?? '',
    startsBeforeWindow: run.oldest === window.length - 1,
    endedBy,
  };
}
