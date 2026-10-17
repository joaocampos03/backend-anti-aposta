import type { MonthKey } from '@shared/domain/calendar.js';
import type { BettingCeiling } from './betting-ceiling.js';
import type { CeilingTerm } from './ceiling-term.js';

const WHOLE = 100;

/** The open month has no outcome yet — only a state. */
export type CycleStatus = 'ACTIVE' | 'REACHED' | 'MISSED';

/** One month's betting spend as the statement reports it: net of refunds, never negative. */
export interface MonthlyBetSpend {
  readonly monthKey: MonthKey;
  readonly spentInCents: number;
}

/**
 * One month measured against the ceiling that governed it.
 *
 * It reports a distance and stops. A month past its ceiling is not a verdict:
 * the next month starts over, the earlier months stay on the record, and the
 * wording that goes with it is the frontend's to keep neutral.
 */
export class CeilingCycle {
  private constructor(
    readonly monthKey: MonthKey,
    readonly term: CeilingTerm,
    readonly spentInCents: number,
    readonly status: CycleStatus,
  ) {}

  /**
   * Every month that has data **and** a ceiling in force, newest first. Months
   * before the first ceiling have no cycle: measuring them against a ceiling
   * the user had not chosen yet would invent a failure they never agreed to.
   */
  static measure(
    ceiling: BettingCeiling,
    months: readonly MonthlyBetSpend[],
    currentMonth: MonthKey,
  ): readonly CeilingCycle[] {
    return [...months]
      .sort((left, right) => right.monthKey.localeCompare(left.monthKey))
      .flatMap((month) => {
        const term = ceiling.governing(month.monthKey);

        return term === null ? [] : [CeilingCycle.of(month, term, currentMonth)];
      });
  }

  private static of(month: MonthlyBetSpend, term: CeilingTerm, currentMonth: MonthKey): CeilingCycle {
    const margin = term.amount.inCents - month.spentInCents;
    const status: CycleStatus =
      month.monthKey === currentMonth ? 'ACTIVE' : margin >= 0 ? 'REACHED' : 'MISSED';

    return new CeilingCycle(month.monthKey, term, month.spentInCents, status);
  }

  get ceilingInCents(): number {
    return this.term.amount.inCents;
  }

  /** Positive while spending stayed under the ceiling, negative once it passed. */
  get marginInCents(): number {
    return this.ceilingInCents - this.spentInCents;
  }

  /**
   * Uncapped — the bar caps it, the words keep the real number. A ceiling of
   * zero is a real goal, so it gets an answer rather than a division by zero:
   * any spending against it is the bar's full width.
   */
  get usedPercent(): number {
    if (this.ceilingInCents === 0) {
      return this.spentInCents === 0 ? 0 : WHOLE;
    }

    return Math.round((this.spentInCents / this.ceilingInCents) * WHOLE);
  }

  get isOpen(): boolean {
    return this.status === 'ACTIVE';
  }
}
