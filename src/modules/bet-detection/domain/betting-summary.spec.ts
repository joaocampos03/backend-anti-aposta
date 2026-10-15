import { describe, expect, it } from 'vitest';
import { Calendar } from '@shared/domain/calendar.js';
import { aBetEntry } from '../testing/bet-entry-builder.js';
import { BetWindow, BettingSummary } from './betting-summary.js';

const calendar = new Calendar('America/Sao_Paulo');
/** A Wednesday, 21:47 in São Paulo. */
const NOW = new Date('2026-10-14T00:47:00.000Z');

describe('BetWindow', () => {
  it('counts today, so a 30-day window opens 29 days earlier', () => {
    const window = BetWindow.of(30, NOW, calendar);

    expect(window.toDayKey).toBe('2026-10-13');
    expect(window.fromDayKey).toBe('2026-09-14');
  });

  it('spans a year less a day for the 360-day window', () => {
    const window = BetWindow.of(360, NOW, calendar);

    expect(window.fromDayKey).toBe('2025-10-19');
    expect(window.toDayKey).toBe('2026-10-13');
  });

  it('opens at local midnight, not at a UTC one', () => {
    const window = BetWindow.of(1, NOW, calendar);

    expect(window.startsAt.toISOString()).toBe('2026-10-13T03:00:00.000Z');
  });
});

describe('BettingSummary', () => {
  const window = BetWindow.of(30, NOW, calendar);

  it('buckets the hours a clock in São Paulo would have shown', () => {
    // 02:30 UTC is 23:30 the previous day in São Paulo: the 21h band, not 00h.
    const summary = BettingSummary.of({
      window,
      entries: [aBetEntry().of(-1_000).at(new Date('2026-10-13T02:30:00.000Z')).build()],
      calendar,
    });

    expect(summary.hourBuckets[7]?.count).toBe(1);
    expect(summary.hourBuckets[0]?.count).toBe(0);
  });

  it('puts a bet just after local midnight in the 0h band', () => {
    const summary = BettingSummary.of({
      window,
      entries: [aBetEntry().of(-1_000).at(new Date('2026-10-13T03:10:00.000Z')).build()],
      calendar,
    });

    expect(summary.hourBuckets[0]?.count).toBe(1);
  });

  it('derives every section from the same entries', () => {
    const summary = BettingSummary.of({
      window,
      entries: [
        aBetEntry().of(-10_000).from({ bookmakerId: 'bkm_a' }).build(),
        aBetEntry().of(-5_000).from({ bookmakerId: 'bkm_b' }).build(),
        aBetEntry().of(2_000).from({ bookmakerId: 'bkm_b' }).build(),
      ],
      calendar,
    });

    expect(summary.cost.total.amountInCents).toBe(13_000);
    expect(summary.bookmakers).toHaveLength(2);
    expect(summary.detectionTallies[0]?.count).toBe(2);
    expect(summary.hourBuckets).toHaveLength(8);
  });

  it('answers a stable shape when there is nothing to describe', () => {
    const summary = BettingSummary.empty(window);

    expect(summary.cost.total.amountInCents).toBe(0);
    expect(summary.bookmakers).toEqual([]);
    expect(summary.detectionTallies).toEqual([]);
    expect(summary.hourBuckets).toHaveLength(8);
  });
});
