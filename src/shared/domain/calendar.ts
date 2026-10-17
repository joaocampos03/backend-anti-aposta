const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const MONTHS_IN_A_YEAR = 12;

/** `YYYY-MM-DD` in the calendar's own timezone. */
export type DayKey = string;

/** `YYYY-MM` in the calendar's own timezone. */
export type MonthKey = string;

interface CalendarParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function padded(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/**
 * Day and month boundaries in one named timezone, which for this product is
 * `America/Sao_Paulo` and never UTC. A bet placed at 23:30 in São Paulo belongs
 * to that day: bucketing it in UTC moves it to the next day and costs somebody a
 * streak day for no reason they could ever discover.
 *
 * Pure: it uses `Intl`, which is part of the language, so it still runs in a bare
 * Node REPL. The timezone is injected rather than hardcoded here.
 */
export class Calendar {
  private readonly formatter: Intl.DateTimeFormat;

  constructor(readonly timeZone: string) {
    this.formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  dayKeyOf(instant: Date): DayKey {
    const { year, month, day } = this.partsOf(instant);

    return `${padded(year, 4)}-${padded(month)}-${padded(day)}`;
  }

  monthKeyOf(instant: Date): MonthKey {
    const { year, month } = this.partsOf(instant);

    return `${padded(year, 4)}-${padded(month)}`;
  }

  /**
   * The hour of the day, 0 to 23, as a clock in this timezone reads it.
   *
   * A bet placed at 23:30 in São Paulo belongs to the 21h band. Reading the
   * hour off the server's own clock moves it to 00h whenever the process runs
   * in UTC, which is every deployment of this API.
   */
  hourOf(instant: Date): number {
    return this.partsOf(instant).hour;
  }

  /** The instant at which the given local day begins. */
  startOfDay(dayKey: DayKey): Date {
    const [year = 0, month = 1, day = 1] = dayKey.split('-').map(Number);
    const asIfUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

    return new Date(asIfUtc - this.offsetMillisecondsAt(new Date(asIfUtc)));
  }

  /** The instant at which the local day `days` before `instant` begins. */
  startOfDaysBefore(instant: Date, days: number): Date {
    const startOfToday = this.startOfDay(this.dayKeyOf(instant));

    return this.startOfDay(
      this.dayKeyOf(new Date(startOfToday.getTime() - days * MILLISECONDS_IN_A_DAY)),
    );
  }

  /** The instant at which the local month of `monthKey` begins. */
  startOfMonth(monthKey: MonthKey): Date {
    return this.startOfDay(`${monthKey}-01`);
  }

  /** The instant at which the local month after `monthKey` begins. */
  startOfMonthAfter(monthKey: MonthKey): Date {
    return this.startOfMonth(this.monthKeyAfter(monthKey));
  }

  monthKeyAfter(monthKey: MonthKey): MonthKey {
    return this.shiftedMonthKey(monthKey, 1);
  }

  monthKeyBefore(monthKey: MonthKey): MonthKey {
    return this.shiftedMonthKey(monthKey, -1);
  }

  /**
   * Whole local days left in the month after the day of `instant`: zero on its
   * last day. Rounded, so a daylight-saving hour cannot shave a day off.
   */
  daysRemainingInMonth(instant: Date): number {
    const startOfToday = this.startOfDay(this.dayKeyOf(instant));
    const startOfNextMonth = this.startOfMonthAfter(this.monthKeyOf(instant));

    return Math.round((startOfNextMonth.getTime() - startOfToday.getTime()) / MILLISECONDS_IN_A_DAY) - 1;
  }

  /** How many whole calendar months separate the two instants. */
  monthsBetween(earlier: Date, later: Date): number {
    const from = this.partsOf(earlier);
    const to = this.partsOf(later);

    return (to.year - from.year) * MONTHS_IN_A_YEAR + (to.month - from.month);
  }

  /** The `count` month keys ending at the month of `instant`, newest first. */
  recentMonthKeys(instant: Date, count: number): readonly MonthKey[] {
    const keys: MonthKey[] = [];
    let key = this.monthKeyOf(instant);

    for (let index = 0; index < count; index += 1) {
      keys.push(key);
      key = this.monthKeyBefore(key);
    }

    return keys;
  }

  private shiftedMonthKey(monthKey: MonthKey, offset: number): MonthKey {
    const [year = 0, month = 1] = monthKey.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));

    return `${padded(shifted.getUTCFullYear(), 4)}-${padded(shifted.getUTCMonth() + 1)}`;
  }

  private partsOf(instant: Date): CalendarParts {
    const parts = new Map(
      this.formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );

    return {
      year: Number(parts.get('year')),
      month: Number(parts.get('month')),
      day: Number(parts.get('day')),
      hour: Number(parts.get('hour')) % 24,
      minute: Number(parts.get('minute')),
      second: Number(parts.get('second')),
    };
  }

  /** How far the named zone sits from UTC at that instant, daylight saving included. */
  private offsetMillisecondsAt(instant: Date): number {
    const { year, month, day, hour, minute, second } = this.partsOf(instant);

    return Date.UTC(year, month - 1, day, hour, minute, second) - instant.getTime();
  }
}
