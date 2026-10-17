import { describe, expect, it } from 'vitest';
import { anEmptyCeiling, chooseCeiling } from '../testing/gamification.builders.js';
import { CeilingAmount } from './ceiling-amount.js';
import { CeilingDestination } from './ceiling-destination.js';
import { BettingCeilingSet } from './events/betting-ceiling-set.js';

const OCTOBER = { currentMonth: '2026-10', nextMonth: '2026-11' } as const;
const NOVEMBER = { currentMonth: '2026-11', nextMonth: '2026-12' } as const;

describe('BettingCeiling', () => {
  it('has no ceiling governing any month before the first is chosen', () => {
    expect(anEmptyCeiling().governing('2026-10')).toBeNull();
  });

  it('applies the first ceiling to the month under way', () => {
    const ceiling = anEmptyCeiling();

    const effectiveFrom = chooseCeiling(ceiling, { amountInCents: 100_000, ...OCTOBER });

    expect(effectiveFrom).toBe('2026-10');
    expect(ceiling.governing('2026-10')?.amount.inCents).toBe(100_000);
    expect(ceiling.pullEvents().map((event) => event.name)).toEqual([BettingCeilingSet.NAME]);
  });

  describe('the month under way keeps the ceiling it started with', () => {
    it('schedules a replacement for next month', () => {
      const ceiling = anEmptyCeiling();
      chooseCeiling(ceiling, { amountInCents: 100_000, ...OCTOBER });

      const effectiveFrom = chooseCeiling(ceiling, { amountInCents: 120_000, ...OCTOBER });

      expect(effectiveFrom).toBe('2026-11');
      expect(ceiling.governing('2026-10')?.amount.inCents).toBe(100_000);
      expect(ceiling.scheduledAfter('2026-10')?.amount.inCents).toBe(120_000);
    });

    it('schedules even when the ceiling in force was itself chosen this month', () => {
      const ceiling = anEmptyCeiling();
      chooseCeiling(ceiling, { amountInCents: 100_000, ...OCTOBER });
      chooseCeiling(ceiling, { amountInCents: 0, ...OCTOBER });

      expect(ceiling.governing('2026-10')?.amount.inCents).toBe(100_000);
    });

    it('replaces a scheduled change rather than queueing a second one', () => {
      const ceiling = anEmptyCeiling();
      chooseCeiling(ceiling, { amountInCents: 100_000, ...OCTOBER });
      chooseCeiling(ceiling, { amountInCents: 120_000, ...OCTOBER });
      chooseCeiling(ceiling, { amountInCents: 80_000, ...OCTOBER });

      expect(ceiling.allTerms.map((term) => term.amount.inCents)).toEqual([100_000, 80_000]);
    });

    it('cancels a scheduled change when the value in force is chosen again', () => {
      const ceiling = anEmptyCeiling();
      chooseCeiling(ceiling, { amountInCents: 100_000, ...OCTOBER });
      chooseCeiling(ceiling, { amountInCents: 120_000, ...OCTOBER });

      const effectiveFrom = chooseCeiling(ceiling, { amountInCents: 100_000, ...OCTOBER });

      expect(effectiveFrom).toBe('2026-10');
      expect(ceiling.scheduledAfter('2026-10')).toBeNull();
    });

    it('treats a new destination as a new choice', () => {
      const ceiling = anEmptyCeiling();
      chooseCeiling(ceiling, { amountInCents: 100_000, destination: 'Viagem', ...OCTOBER });

      const effectiveFrom = chooseCeiling(ceiling, {
        amountInCents: 100_000,
        destination: 'Reserva de emergência',
        ...OCTOBER,
      });

      expect(effectiveFrom).toBe('2026-11');
    });
  });

  it('keeps every earlier term, so closed months stay measured against their own ceiling', () => {
    const ceiling = anEmptyCeiling();
    chooseCeiling(ceiling, { amountInCents: 100_000, ...OCTOBER });
    chooseCeiling(ceiling, { amountInCents: 120_000, ...OCTOBER });
    chooseCeiling(ceiling, { amountInCents: 90_000, ...NOVEMBER });

    expect(ceiling.governing('2026-10')?.amount.inCents).toBe(100_000);
    expect(ceiling.governing('2026-11')?.amount.inCents).toBe(120_000);
    expect(ceiling.governing('2026-12')?.amount.inCents).toBe(90_000);
  });
});

describe('CeilingAmount', () => {
  it('accepts zero, which is a real ceiling', () => {
    expect(CeilingAmount.fromCents(0).ok).toBe(true);
  });

  it('refuses a negative and a fraction of a cent', () => {
    expect(CeilingAmount.fromCents(-1).ok).toBe(false);
    expect(CeilingAmount.fromCents(0.5).ok).toBe(false);
  });
});

describe('CeilingDestination', () => {
  it('reads a blank destination as absent', () => {
    const destination = CeilingDestination.create('   ');

    expect(destination.ok && destination.value).toBeNull();
  });

  it('refuses a destination past sixty characters', () => {
    expect(CeilingDestination.create('a'.repeat(61)).ok).toBe(false);
  });
});
