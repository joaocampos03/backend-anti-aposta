import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '@shared/domain/calendar.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { InMemoryBettingCeilingRepository } from '../infrastructure/in-memory/in-memory-betting-ceiling.repository.js';
import { InMemoryMonthlyBetHistoryReader } from '../infrastructure/in-memory/in-memory-monthly-bet-history-reader.js';
import { FixedRateYieldCalculator } from '../infrastructure/in-memory/in-memory-yield-calculator.js';
import { anEmptyCeiling, chooseCeiling, USER_ID } from '../testing/gamification.builders.js';
import { DescribeBettingCeiling } from './describe-betting-ceiling.use-case.js';
import { SetBettingCeiling } from './set-betting-ceiling.use-case.js';

/** 17 October 2026, mid-afternoon in São Paulo. */
const NOW = new Date('2026-10-17T15:00:00.000Z');

let ceilings: InMemoryBettingCeilingRepository;
let history: InMemoryMonthlyBetHistoryReader;
let setBettingCeiling: SetBettingCeiling;
let describeBettingCeiling: DescribeBettingCeiling;

beforeEach(() => {
  const calendar = new Calendar('America/Sao_Paulo');
  const clock = new FixedClock(NOW);
  ceilings = new InMemoryBettingCeilingRepository();
  history = new InMemoryMonthlyBetHistoryReader();
  setBettingCeiling = new SetBettingCeiling({
    ceilings,
    idGenerator: new SequentialIdGenerator(),
    clock,
    calendar,
    events: new RecordingEventPublisher(),
  });
  describeBettingCeiling = new DescribeBettingCeiling({
    ceilings,
    history,
    yields: new FixedRateYieldCalculator(10),
    calendar,
    clock,
  });
});

/** A ceiling chosen in August that governs August onwards. */
function aCeilingSinceAugust(amountInCents: number): void {
  const ceiling = anEmptyCeiling();
  chooseCeiling(ceiling, { amountInCents, currentMonth: '2026-08', nextMonth: '2026-09' });
  ceilings.ceilings.push(ceiling);
}

describe('SetBettingCeiling', () => {
  it('applies the first ceiling to the month under way', async () => {
    const result = await setBettingCeiling.execute({
      userId: USER_ID,
      amountInCents: 100_000,
      destination: 'Reserva de emergência',
    });

    expect(result.ok && result.value.effectiveFromMonthKey).toBe('2026-10');
    expect(result.ok && result.value.ceiling?.amountInCents).toBe(100_000);
    expect(result.ok && result.value.scheduled).toBeNull();
  });

  it('schedules a replacement for next month and keeps this month as it was', async () => {
    await setBettingCeiling.execute({ userId: USER_ID, amountInCents: 100_000, destination: null });

    const result = await setBettingCeiling.execute({ userId: USER_ID, amountInCents: 50_000, destination: null });

    expect(result.ok && result.value.effectiveFromMonthKey).toBe('2026-11');
    expect(result.ok && result.value.ceiling?.amountInCents).toBe(100_000);
    expect(result.ok && result.value.scheduled?.amountInCents).toBe(50_000);
  });

  it('refuses a negative ceiling as a field error', async () => {
    const result = await setBettingCeiling.execute({ userId: USER_ID, amountInCents: -1, destination: null });

    expect(result.ok ? null : Object.keys(result.error.details)).toEqual(['amount.amountInCents']);
  });

  it('answers 409 when another request changed the ceiling first', async () => {
    ceilings.conflictOnNextSave = true;

    const result = await setBettingCeiling.execute({ userId: USER_ID, amountInCents: 0, destination: null });

    expect(result.ok ? null : result.error.code).toBe('CEILING_MODIFIED_CONCURRENTLY');
  });
});

describe('DescribeBettingCeiling', () => {
  it('measures nothing without a consent, while still returning the ceiling the user chose', async () => {
    aCeilingSinceAugust(100_000);

    const result = await describeBettingCeiling.execute({ userId: USER_ID });

    expect(result.ok && result.value.syncStatus).toBe('NO_CONSENT');
    expect(result.ok && result.value.ceiling?.amountInCents).toBe(100_000);
    expect(result.ok && result.value.current).toBeNull();
    expect(result.ok && result.value.cycles).toEqual([]);
    expect(result.ok && result.value.simulation.steps).toEqual([]);
  });

  it('measures nothing while the statement is still syncing', async () => {
    aCeilingSinceAugust(100_000);
    history.history = { syncStatus: 'SYNCING', months: [{ monthKey: '2026-09', spentInCents: 1 }] };

    const result = await describeBettingCeiling.execute({ userId: USER_ID });

    expect(result.ok && result.value.cycles).toEqual([]);
  });

  it('separates the open month from the closed ones and skips months before the first ceiling', async () => {
    aCeilingSinceAugust(100_000);
    history.history = {
      syncStatus: 'READY',
      months: [
        { monthKey: '2026-10', spentInCents: 40_000 },
        { monthKey: '2026-09', spentInCents: 164_000 },
        { monthKey: '2026-08', spentInCents: 90_000 },
        { monthKey: '2026-07', spentInCents: 500_000 },
      ],
    };

    const result = await describeBettingCeiling.execute({ userId: USER_ID });

    expect(result.ok && result.value.current).toMatchObject({
      monthKey: '2026-10',
      status: 'ACTIVE',
      marginInCents: 60_000,
      marginYieldEquivalentInCents: 66_000,
    });
    expect(result.ok && result.value.cycles.map((cycle) => [cycle.monthKey, cycle.status])).toEqual([
      ['2026-09', 'MISSED'],
      ['2026-08', 'REACHED'],
    ]);
  });

  it('measures the open month at zero when the statement is ready and nothing has moved yet', async () => {
    aCeilingSinceAugust(100_000);
    history.history = { syncStatus: 'READY', months: [{ monthKey: '2026-09', spentInCents: 10_000 }] };

    const result = await describeBettingCeiling.execute({ userId: USER_ID });

    expect(result.ok && result.value.current?.spentInCents).toBe(0);
  });

  it('simulates over every closed month with data, before the first ceiling included, never the open one', async () => {
    history.history = {
      syncStatus: 'READY',
      months: [
        { monthKey: '2026-10', spentInCents: 900_000 },
        { monthKey: '2026-09', spentInCents: 20_000 },
        { monthKey: '2026-08', spentInCents: 0 },
      ],
    };

    const result = await describeBettingCeiling.execute({ userId: USER_ID });
    const simulation = result.ok ? result.value.simulation : null;

    expect(simulation?.monthsCounted).toBe(2);
    expect(simulation?.capInCents).toBe(100_000);
    expect(simulation?.steps[0]).toEqual({
      ceilingInCents: 0,
      monthsWithin: 1,
      averageExcessInCents: 20_000,
      totalExcessInCents: 20_000,
      averageExcessYieldEquivalentInCents: 22_000,
    });
  });

  it('says how many days the month has left and which month comes next', async () => {
    const result = await describeBettingCeiling.execute({ userId: USER_ID });

    expect(result.ok && result.value.month).toEqual({
      monthKey: '2026-10',
      nextMonthKey: '2026-11',
      daysRemaining: 14,
    });
    expect(result.ok && result.value.annualRatePercent).toBe(10);
  });
});
