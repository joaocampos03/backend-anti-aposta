import { describe, expect, it } from 'vitest';
import { anEmptyCeiling, chooseCeiling } from '../testing/gamification.builders.js';
import { BadgeAttainment } from './badge-attainment.js';
import { CeilingCycle, type MonthlyBetSpend } from './ceiling-cycle.js';
import { StreakRecord } from './streak-record.js';

const CURRENT_MONTH = '2026-10';

function cyclesUnder(ceilingInCents: number, since: string, months: readonly MonthlyBetSpend[]): readonly CeilingCycle[] {
  const ceiling = anEmptyCeiling();
  chooseCeiling(ceiling, { amountInCents: ceilingInCents, currentMonth: since, nextMonth: '2099-01' });

  return CeilingCycle.measure(ceiling, months, CURRENT_MONTH);
}

function month(monthKey: string, spentInCents: number): MonthlyBetSpend {
  return { monthKey, spentInCents };
}

describe('BadgeAttainment.ofStreak', () => {
  const window = ['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13', '2026-10-12'];

  it('measures nothing while every day so far had a bet', () => {
    const record = StreakRecord.derive(window.slice(0, 2), [
      { dayKey: '2026-10-17', counterparty: 'Bet', matchedBy: 'GAMBLING_MCC' },
      { dayKey: '2026-10-16', counterparty: 'Bet', matchedBy: 'GAMBLING_MCC' },
    ]);

    expect(BadgeAttainment.ofStreak(record)).toEqual({ value: 0, evidence: null });
  });

  it('counts the stretch under way when it is the longest', () => {
    const record = StreakRecord.derive(window, [{ dayKey: '2026-10-12', counterparty: 'Bet', matchedBy: 'GAMBLING_MCC' }]);

    expect(BadgeAttainment.ofStreak(record)).toEqual({
      value: 4,
      evidence: { kind: 'CURRENT_STREAK', days: 4, startsBeforeWindow: false },
    });
  });

  it('carries the lower bound of a stretch the window cut off', () => {
    const record = StreakRecord.derive(window, [{ dayKey: '2026-10-16', counterparty: 'Bet', matchedBy: 'GAMBLING_MCC' }]);

    expect(BadgeAttainment.ofStreak(record).evidence).toEqual({
      kind: 'CLOSED_STREAK',
      days: 4,
      firstDayKey: '2026-10-12',
      lastDayKey: '2026-10-15',
      startsBeforeWindow: true,
    });
  });
});

describe('BadgeAttainment.ofCeiling', () => {
  it('lets a month that only ties the ceiling count, as the ceiling screen does', () => {
    const cycles = cyclesUnder(100_000, '2026-09', [month('2026-09', 100_000)]);

    expect(BadgeAttainment.ofCeiling(cycles).value).toBe(1);
  });

  it('never counts the open month, however far under the ceiling it is', () => {
    const cycles = cyclesUnder(100_000, '2026-10', [month('2026-10', 0)]);

    expect(BadgeAttainment.ofCeiling(cycles)).toEqual({ value: 0, evidence: null });
  });

  it('breaks a run at a month with no data rather than bridging the gap', () => {
    const cycles = cyclesUnder(100_000, '2026-05', [
      month('2026-09', 10_000),
      month('2026-08', 10_000),
      month('2026-06', 10_000),
    ]);

    expect(BadgeAttainment.ofCeiling(cycles)).toEqual({
      value: 2,
      evidence: { kind: 'MONTH_RUN', months: 2, lastMonthKey: '2026-09' },
    });
  });

  it('breaks a run at a missed month', () => {
    const cycles = cyclesUnder(100_000, '2026-06', [
      month('2026-09', 10_000),
      month('2026-08', 150_000),
      month('2026-07', 10_000),
      month('2026-06', 10_000),
    ]);

    expect(BadgeAttainment.ofCeiling(cycles).evidence).toEqual({ kind: 'MONTH_RUN', months: 2, lastMonthKey: '2026-07' });
  });
});

describe('BadgeAttainment.ofReduction', () => {
  it('does not count a month whose predecessor has no data', () => {
    expect(BadgeAttainment.ofReduction([month('2026-09', 10_000), month('2026-07', 90_000)])).toEqual({
      value: 0,
      evidence: null,
    });
  });

  it('does not count a month that only matched the one before it', () => {
    expect(BadgeAttainment.ofReduction([month('2026-09', 50_000), month('2026-08', 50_000)]).value).toBe(0);
  });

  it('counts consecutive falls, each against the month right before it', () => {
    const closedMonths = [
      month('2026-09', 10_000),
      month('2026-08', 20_000),
      month('2026-07', 30_000),
      month('2026-06', 5_000),
    ];

    expect(BadgeAttainment.ofReduction(closedMonths)).toEqual({
      value: 2,
      evidence: { kind: 'MONTH_RUN', months: 2, lastMonthKey: '2026-09' },
    });
  });
});

describe('BadgeAttainment.ofSavings', () => {
  it('measures nothing before a goal is reached', () => {
    expect(BadgeAttainment.ofSavings({ count: 0, titles: [] })).toEqual({ value: 0, evidence: null });
  });

  it('names the reached goals so the reader can check them against their record', () => {
    expect(BadgeAttainment.ofSavings({ count: 2, titles: ['Geladeira', 'Reserva'] })).toEqual({
      value: 2,
      evidence: { kind: 'REACHED_GOALS', count: 2, titles: ['Geladeira', 'Reserva'] },
    });
  });
});
