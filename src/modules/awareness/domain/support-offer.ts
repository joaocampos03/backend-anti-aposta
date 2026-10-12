/** The high band's floor: R$ 1.000,00 a month in bets. */
export const HIGH_BAND_FLOOR_IN_CENTS = 100_000;

/** Whole months in a row above the floor before support is offered. */
export const SUSTAINED_MONTHS_REQUIRED = 3;

/** One whole calendar month of betting, newest first when listed. */
export interface MonthlyBetSpend {
  readonly monthKey: string;
  readonly betSpendInCents: number;
}

/**
 * Whether to put support resources in front of somebody, and what was counted.
 *
 * The rule is deliberately conservative, and its negative cases are the ones
 * that matter: a missed offer costs one screen, while a false one tells somebody
 * they may have a problem they do not have, on the evidence of a bank statement
 * alone. It reports what it counted and stops — there is no risk level, no
 * severity and no recommendation here, because the product has seen a statement
 * and is in no position to say what it means about anyone.
 *
 * The current month never counts: it is incomplete by definition, and half a
 * month above the floor is not a month above the floor.
 */
export class SupportOffer {
  private constructor(
    readonly shouldOffer: boolean,
    readonly sustainedMonths: number,
    readonly isRising: boolean,
    readonly thresholdInCents: number,
  ) {}

  /**
   * @param wholeMonths newest first, the current partial month already removed.
   */
  static from(
    wholeMonths: readonly MonthlyBetSpend[],
    thresholdInCents: number = HIGH_BAND_FLOOR_IN_CENTS,
  ): SupportOffer {
    const sustained = SupportOffer.sustainedRun(wholeMonths, thresholdInCents);

    return new SupportOffer(
      sustained.length >= SUSTAINED_MONTHS_REQUIRED,
      sustained.length,
      SupportOffer.isRisingThrough(sustained),
      thresholdInCents,
    );
  }

  /** The unbroken run of months at or above the floor, ending at the latest whole one. */
  private static sustainedRun(
    wholeMonths: readonly MonthlyBetSpend[],
    thresholdInCents: number,
  ): readonly MonthlyBetSpend[] {
    const run: MonthlyBetSpend[] = [];

    for (const month of wholeMonths) {
      if (month.betSpendInCents < thresholdInCents) {
        return run;
      }

      run.push(month);
    }

    return run;
  }

  /** True only when every month of the run exceeded the one before it. */
  private static isRisingThrough(newestFirst: readonly MonthlyBetSpend[]): boolean {
    if (newestFirst.length < 2) {
      return false;
    }

    return newestFirst.every(
      (month, index) =>
        index === 0 || month.betSpendInCents < (newestFirst[index - 1]?.betSpendInCents ?? 0),
    );
  }
}
