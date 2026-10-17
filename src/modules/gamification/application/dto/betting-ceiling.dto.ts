import type { CycleStatus } from '../../domain/ceiling-cycle.js';
import type { StatementReadiness } from '../ports/monthly-bet-history-reader.port.js';

export interface CeilingTermDto {
  readonly amountInCents: number;
  readonly destination: string | null;
  readonly effectiveFromMonthKey: string;
  readonly setAt: string;
}

export interface CeilingCycleDto {
  readonly monthKey: string;
  readonly ceilingInCents: number;
  readonly destination: string | null;
  readonly spentInCents: number;
  readonly status: CycleStatus;
  /** Signed: positive under the ceiling. */
  readonly marginInCents: number;
  readonly usedPercent: number;
}

export interface CurrentCycleDto extends CeilingCycleDto {
  /** `|margin|` reframed over twelve months at the response's rate. */
  readonly marginYieldEquivalentInCents: number;
}

export interface SimulationStepDto {
  readonly ceilingInCents: number;
  readonly monthsWithin: number;
  readonly averageExcessInCents: number;
  readonly totalExcessInCents: number;
  readonly averageExcessYieldEquivalentInCents: number;
}

export interface BettingCeilingOverviewOutput {
  readonly syncStatus: StatementReadiness;
  readonly month: {
    readonly monthKey: string;
    readonly nextMonthKey: string;
    readonly daysRemaining: number;
  };
  readonly ceiling: CeilingTermDto | null;
  readonly scheduled: CeilingTermDto | null;
  readonly current: CurrentCycleDto | null;
  /** Closed months only, newest first. */
  readonly cycles: readonly CeilingCycleDto[];
  readonly simulation: {
    readonly monthsCounted: number;
    readonly stepInCents: number;
    readonly capInCents: number;
    readonly steps: readonly SimulationStepDto[];
  };
  readonly annualRatePercent: number;
}

export interface SetBettingCeilingInput {
  readonly userId: string;
  readonly amountInCents: number;
  readonly destination: string | null;
}

export interface SetBettingCeilingOutput {
  readonly ceiling: CeilingTermDto | null;
  readonly scheduled: CeilingTermDto | null;
  readonly effectiveFromMonthKey: string;
}
