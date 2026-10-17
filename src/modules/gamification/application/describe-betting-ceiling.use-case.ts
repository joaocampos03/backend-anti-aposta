import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Calendar, MonthKey } from '@shared/domain/calendar.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BettingCeiling } from '../domain/betting-ceiling.js';
import type { BettingCeilingRepository } from '../domain/betting-ceiling.repository.js';
import { CeilingCycle, type MonthlyBetSpend } from '../domain/ceiling-cycle.js';
import { CeilingSimulation, CEILING_STEP_IN_CENTS } from '../domain/ceiling-simulation.js';
import { cycleToDto, termsInView } from './ceiling-view.js';
import type {
  BettingCeilingOverviewOutput,
  CurrentCycleDto,
  SimulationStepDto,
} from './dto/betting-ceiling.dto.js';
import type {
  MonthlyBetHistory,
  MonthlyBetHistoryReader,
} from './ports/monthly-bet-history-reader.port.js';
import type { YieldCalculator } from './ports/yield-calculator.port.js';

/** The open month plus eleven closed ones: the window the charts draw. */
export const CEILING_WINDOW_IN_MONTHS = 12;

export interface DescribeBettingCeilingDependencies {
  readonly ceilings: BettingCeilingRepository;
  readonly history: MonthlyBetHistoryReader;
  readonly yields: YieldCalculator;
  readonly calendar: Calendar;
  readonly clock: Clock;
}

interface MonthContext {
  readonly current: MonthKey;
  readonly ceiling: BettingCeiling | null;
}

/**
 * Everything the ceiling half of the goals screen shows, computed on read.
 *
 * Nothing is stored about a month's outcome: it is the ceiling in force against
 * the statement's figure for that month, so a corrected classification moves
 * the outcome the moment it lands. No consent is not zero — without a ready
 * statement the response carries the user's own choice and no measured figure.
 */
export class DescribeBettingCeiling implements UseCase<{ readonly userId: string }, BettingCeilingOverviewOutput> {
  constructor(private readonly dependencies: DescribeBettingCeilingDependencies) {}

  async execute(input: {
    readonly userId: string;
  }): Promise<Result<BettingCeilingOverviewOutput, AppError>> {
    const now = this.dependencies.clock.now();
    const current = this.dependencies.calendar.monthKeyOf(now);
    const ceiling = await this.dependencies.ceilings.findByUserId(UniqueEntityId.restore(input.userId));
    const history = await this.dependencies.history.recentMonths(input.userId, CEILING_WINDOW_IN_MONTHS);
    const measured = history.syncStatus === 'READY' ? this.measured(history, { current, ceiling }) : NOTHING_MEASURED;

    return ok({
      syncStatus: history.syncStatus,
      month: {
        monthKey: current,
        nextMonthKey: this.dependencies.calendar.monthKeyAfter(current),
        daysRemaining: this.dependencies.calendar.daysRemainingInMonth(now),
      },
      ...termsInView(ceiling, current),
      ...measured,
      annualRatePercent: this.dependencies.yields.annualRatePercent(),
    });
  }

  private measured(history: MonthlyBetHistory, context: MonthContext): MeasuredFigures {
    const closedMonths = history.months.filter((month) => month.monthKey !== context.current);
    const cycles =
      context.ceiling === null
        ? []
        : CeilingCycle.measure(context.ceiling, withOpenMonth(history.months, context.current), context.current);
    const openCycle = cycles.find((cycle) => cycle.isOpen);

    return {
      current: openCycle === undefined ? null : this.currentCycle(openCycle),
      cycles: cycles.filter((cycle) => !cycle.isOpen).map(cycleToDto),
      simulation: this.simulation(closedMonths, chosenCeilings(context)),
    };
  }

  private currentCycle(cycle: CeilingCycle): CurrentCycleDto {
    return {
      ...cycleToDto(cycle),
      marginYieldEquivalentInCents: this.dependencies.yields.futureValueInCents(
        Math.abs(cycle.marginInCents),
      ),
    };
  }

  private simulation(
    closedMonths: readonly MonthlyBetSpend[],
    chosenInCents: readonly number[],
  ): MeasuredFigures['simulation'] {
    const simulation = CeilingSimulation.over(closedMonths.map((month) => month.spentInCents));
    const range = simulation.range(chosenInCents);

    return {
      monthsCounted: simulation.monthsCounted,
      stepInCents: range.stepInCents,
      capInCents: range.capInCents,
      steps: simulation.steps(range).map((step) => this.stepToDto(step)),
    };
  }

  private stepToDto(step: ReturnType<CeilingSimulation['at']>): SimulationStepDto {
    return {
      ceilingInCents: step.ceilingInCents,
      monthsWithin: step.monthsWithin,
      averageExcessInCents: step.averageExcessInCents,
      totalExcessInCents: step.totalExcessInCents,
      averageExcessYieldEquivalentInCents: this.dependencies.yields.futureValueInCents(
        step.averageExcessInCents,
      ),
    };
  }
}

type MeasuredFigures = Pick<BettingCeilingOverviewOutput, 'current' | 'cycles' | 'simulation'>;

const NOTHING_MEASURED: MeasuredFigures = {
  current: null,
  cycles: [],
  simulation: { monthsCounted: 0, stepInCents: CEILING_STEP_IN_CENTS, capInCents: 0, steps: [] },
};

/**
 * With a ready statement, a month that has no movement yet has spent nothing
 * on bets so far — a fact, unlike a closed month with no data at all, which
 * stays absent.
 */
function withOpenMonth(months: readonly MonthlyBetSpend[], current: MonthKey): readonly MonthlyBetSpend[] {
  const hasOpenMonth = months.some((month) => month.monthKey === current);

  return hasOpenMonth ? months : [{ monthKey: current, spentInCents: 0 }, ...months];
}

/** The values the user already chose, so the simulator's track always reaches them. */
function chosenCeilings(context: MonthContext): readonly number[] {
  return [context.ceiling?.governing(context.current), context.ceiling?.scheduledAfter(context.current)]
    .filter((term) => term !== null && term !== undefined)
    .map((term) => term.amount.inCents);
}
