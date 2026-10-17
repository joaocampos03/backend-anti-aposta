/** R$ 50,00 — fine enough to land on a number that means something, coarse enough to drag. */
export const CEILING_STEP_IN_CENTS = 5_000;

/** R$ 100,00 — the track ends on a round figure rather than on one month's total. */
const CEILING_CAP_UNIT_IN_CENTS = 10_000;

/**
 * R$ 1.000,00 — the shortest the track ever is. Without it, somebody whose
 * months were light gets a slider that ends at R$ 200 and no room to choose a
 * ceiling above what they happened to spend.
 */
export const MINIMUM_CEILING_CAP_IN_CENTS = 100_000;

/** Past this many stops the step widens, so a heavy month cannot balloon the response. */
export const MAXIMUM_SIMULATION_STEPS = 200;

export interface SimulatedCeiling {
  readonly ceilingInCents: number;
  readonly monthsCounted: number;
  readonly monthsWithin: number;
  /** Mean overshoot across the months that passed the ceiling. Zero when none did. */
  readonly averageExcessInCents: number;
  readonly totalExcessInCents: number;
}

export interface SimulationRange {
  readonly capInCents: number;
  readonly stepInCents: number;
}

/**
 * What a ceiling would have meant against the months the user actually had.
 *
 * Picking a number in the abstract is a guess; picking one beside eleven real
 * months is a decision — this is the System 2 device of the goals screen. It
 * answers in counts and differences and stops: it recommends no value, and it
 * does not claim the money would have gone anywhere better. The person may well
 * have spent it on something else, and a screen that pretended otherwise would
 * be selling a regret instead of reporting a number.
 *
 * Closed months only. The open month is half a month and would understate
 * every ceiling tried.
 */
export class CeilingSimulation {
  private constructor(private readonly closedMonthsInCents: readonly number[]) {}

  static over(closedMonthsInCents: readonly number[]): CeilingSimulation {
    return new CeilingSimulation(closedMonthsInCents);
  }

  get monthsCounted(): number {
    return this.closedMonthsInCents.length;
  }

  at(ceilingInCents: number): SimulatedCeiling {
    const excesses = this.closedMonthsInCents.map((spent) => Math.max(0, spent - ceilingInCents));
    const monthsAbove = excesses.filter((excess) => excess > 0).length;
    const totalExcessInCents = excesses.reduce((total, excess) => total + excess, 0);

    return {
      ceilingInCents,
      monthsCounted: this.monthsCounted,
      monthsWithin: this.monthsCounted - monthsAbove,
      averageExcessInCents: monthsAbove === 0 ? 0 : Math.round(totalExcessInCents / monthsAbove),
      totalExcessInCents,
    };
  }

  /**
   * The slider's track: at least `MINIMUM_CEILING_CAP_IN_CENTS`, past the worst
   * month and past every ceiling the user already chose (so their own value is
   * always on it), rounded up to a round figure, with at most
   * `MAXIMUM_SIMULATION_STEPS` stops.
   */
  range(chosenCeilingsInCents: readonly number[]): SimulationRange {
    const largest = Math.max(
      MINIMUM_CEILING_CAP_IN_CENTS,
      ...this.closedMonthsInCents,
      ...chosenCeilingsInCents,
    );
    const roundedCap = roundUpTo(largest, CEILING_CAP_UNIT_IN_CENTS);
    const stepInCents = Math.max(
      CEILING_STEP_IN_CENTS,
      roundUpTo(Math.ceil(roundedCap / MAXIMUM_SIMULATION_STEPS), CEILING_STEP_IN_CENTS),
    );

    return { capInCents: roundUpTo(roundedCap, stepInCents), stepInCents };
  }

  /** Every stop on the track, from zero to the cap. */
  steps(range: SimulationRange): readonly SimulatedCeiling[] {
    const count = range.capInCents / range.stepInCents;

    return Array.from({ length: count + 1 }, (_, index) => this.at(index * range.stepInCents));
  }
}

function roundUpTo(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit;
}
