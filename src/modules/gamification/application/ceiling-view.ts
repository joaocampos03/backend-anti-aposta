import type { MonthKey } from '@shared/domain/calendar.js';
import type { BettingCeiling } from '../domain/betting-ceiling.js';
import type { CeilingCycle } from '../domain/ceiling-cycle.js';
import type { CeilingTerm } from '../domain/ceiling-term.js';
import type { CeilingCycleDto, CeilingTermDto } from './dto/betting-ceiling.dto.js';

export function termToDto(term: CeilingTerm | null): CeilingTermDto | null {
  if (term === null) {
    return null;
  }

  return {
    amountInCents: term.amount.inCents,
    destination: term.destination?.value ?? null,
    effectiveFromMonthKey: term.effectiveFrom,
    setAt: term.setAt.toISOString(),
  };
}

/** The ceiling in force this month and the one waiting for the next, as one pair. */
export function termsInView(
  ceiling: BettingCeiling | null,
  currentMonth: MonthKey,
): { readonly ceiling: CeilingTermDto | null; readonly scheduled: CeilingTermDto | null } {
  return {
    ceiling: termToDto(ceiling?.governing(currentMonth) ?? null),
    scheduled: termToDto(ceiling?.scheduledAfter(currentMonth) ?? null),
  };
}

export function cycleToDto(cycle: CeilingCycle): CeilingCycleDto {
  return {
    monthKey: cycle.monthKey,
    ceilingInCents: cycle.ceilingInCents,
    destination: cycle.term.destination?.value ?? null,
    spentInCents: cycle.spentInCents,
    status: cycle.status,
    marginInCents: cycle.marginInCents,
    usedPercent: cycle.usedPercent,
  };
}
