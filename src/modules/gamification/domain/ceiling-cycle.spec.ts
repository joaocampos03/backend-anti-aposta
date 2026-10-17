import { describe, expect, it } from 'vitest';
import { anEmptyCeiling, chooseCeiling } from '../testing/gamification.builders.js';
import type { BettingCeiling } from './betting-ceiling.js';
import { CeilingCycle } from './ceiling-cycle.js';

function ceilingSince(monthKey: string, amountInCents: number): BettingCeiling {
  const ceiling = anEmptyCeiling();
  chooseCeiling(ceiling, { amountInCents, currentMonth: monthKey, nextMonth: '2099-01' });

  return ceiling;
}

describe('CeilingCycle.measure', () => {
  it('gives months before the first ceiling no cycle at all', () => {
    const cycles = CeilingCycle.measure(
      ceilingSince('2026-09', 100_000),
      [
        { monthKey: '2026-08', spentInCents: 500_000 },
        { monthKey: '2026-09', spentInCents: 50_000 },
      ],
      '2026-10',
    );

    expect(cycles.map((cycle) => cycle.monthKey)).toEqual(['2026-09']);
  });

  it('calls the open month active whatever it has spent', () => {
    const [cycle] = CeilingCycle.measure(
      ceilingSince('2026-10', 100_000),
      [{ monthKey: '2026-10', spentInCents: 150_000 }],
      '2026-10',
    );

    expect(cycle?.status).toBe('ACTIVE');
    expect(cycle?.marginInCents).toBe(-50_000);
  });

  it('reaches a closed month that landed exactly on the ceiling', () => {
    const [cycle] = CeilingCycle.measure(
      ceilingSince('2026-08', 100_000),
      [{ monthKey: '2026-09', spentInCents: 100_000 }],
      '2026-10',
    );

    expect(cycle?.status).toBe('REACHED');
    expect(cycle?.marginInCents).toBe(0);
  });

  it('misses a closed month past the ceiling, by a signed margin', () => {
    const [cycle] = CeilingCycle.measure(
      ceilingSince('2026-08', 100_000),
      [{ monthKey: '2026-09', spentInCents: 164_000 }],
      '2026-10',
    );

    expect(cycle?.status).toBe('MISSED');
    expect(cycle?.marginInCents).toBe(-64_000);
    expect(cycle?.usedPercent).toBe(164);
  });

  it('answers a zero ceiling without dividing by it', () => {
    const cycles = CeilingCycle.measure(
      ceilingSince('2026-08', 0),
      [
        { monthKey: '2026-09', spentInCents: 0 },
        { monthKey: '2026-08', spentInCents: 1 },
      ],
      '2026-10',
    );

    expect(cycles.map((cycle) => cycle.usedPercent)).toEqual([0, 100]);
    expect(cycles.map((cycle) => cycle.status)).toEqual(['REACHED', 'MISSED']);
  });

  it('measures each month against the ceiling in force in it', () => {
    const ceiling = anEmptyCeiling();
    chooseCeiling(ceiling, { amountInCents: 100_000, currentMonth: '2026-07', nextMonth: '2026-08' });
    chooseCeiling(ceiling, { amountInCents: 120_000, currentMonth: '2026-08', nextMonth: '2026-09' });

    const cycles = CeilingCycle.measure(
      ceiling,
      [
        { monthKey: '2026-08', spentInCents: 110_000 },
        { monthKey: '2026-09', spentInCents: 110_000 },
      ],
      '2026-10',
    );

    expect(cycles.map((cycle) => [cycle.monthKey, cycle.status])).toEqual([
      ['2026-09', 'REACHED'],
      ['2026-08', 'MISSED'],
    ]);
  });
});
