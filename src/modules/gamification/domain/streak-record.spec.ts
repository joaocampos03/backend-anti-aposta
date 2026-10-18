import { describe, expect, it } from 'vitest';
import type { BetDay } from './bet-day.js';
import { StreakRecord } from './streak-record.js';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const TODAY = '2026-10-17';

/** `dayCount` day keys ending today, newest first — the window the use case builds. */
function windowOf(dayCount: number): readonly string[] {
  const today = Date.parse(`${TODAY}T12:00:00Z`);

  return Array.from({ length: dayCount }, (_, daysAgo) =>
    new Date(today - daysAgo * MILLISECONDS_IN_A_DAY).toISOString().slice(0, 10),
  );
}

function betOn(dayKey: string, counterparty = 'Bet Nacional'): BetDay {
  return { dayKey, counterparty, matchedBy: 'GAMBLING_MCC' };
}

describe('StreakRecord.derive', () => {
  it('does not count today, so a bet yesterday and a quiet today reads zero', () => {
    const record = StreakRecord.derive(windowOf(10), [betOn('2026-10-16')]);

    expect(record.current.days).toBe(0);
    expect(record.current.hasBetToday).toBe(false);
    expect(record.current.lastBet?.dayKey).toBe('2026-10-16');
  });

  it('counts the complete days since the last bet', () => {
    const record = StreakRecord.derive(windowOf(10), [betOn('2026-10-12')]);

    expect(record.current.days).toBe(4);
  });

  it('says a bet was placed today rather than counting anything', () => {
    const record = StreakRecord.derive(windowOf(10), [betOn(TODAY)]);

    expect(record.current).toMatchObject({ days: 0, hasBetToday: true });
  });

  it('reports a window with no bets as a lower bound, never as zero', () => {
    const record = StreakRecord.derive(windowOf(40), []);

    expect(record.current).toEqual({ days: 39, hasBetToday: false, startsBeforeWindow: true, lastBet: null });
    expect(record.closedStreaks).toEqual([]);
    expect(record.longest).toBeNull();
  });

  it('keeps the stretch touching today out of the closed record', () => {
    const record = StreakRecord.derive(windowOf(10), [betOn('2026-10-14'), betOn('2026-10-09')]);

    expect(record.closedStreaks.map((streak) => streak.lastDayKey)).toEqual(['2026-10-13', '2026-10-08']);
  });

  it('names the bet on the day after a stretch as the one that ended it', () => {
    const record = StreakRecord.derive(windowOf(10), [
      betOn('2026-10-14', 'Sorte Online'),
      betOn('2026-10-09', 'Bet Nacional'),
    ]);

    expect(record.longest).toEqual({
      lengthInDays: 4,
      firstDayKey: '2026-10-10',
      lastDayKey: '2026-10-13',
      startsBeforeWindow: false,
      endedBy: betOn('2026-10-14', 'Sorte Online'),
    });
  });

  it('marks the stretch that runs off the window edge as starting before it', () => {
    const record = StreakRecord.derive(windowOf(10), [betOn('2026-10-12')]);

    expect(record.longest).toMatchObject({
      lengthInDays: 4,
      firstDayKey: '2026-10-08',
      lastDayKey: '2026-10-11',
      startsBeforeWindow: true,
    });
  });

  it('records a single bet-free day between two bets as a stretch of one', () => {
    const record = StreakRecord.derive(windowOf(5), [betOn('2026-10-15'), betOn('2026-10-13')]);

    expect(record.closedStreaks).toHaveLength(1);
    expect(record.closedStreaks[0]?.lengthInDays).toBe(1);
  });

  it('orders closed stretches longest first, the newer first on a tie', () => {
    const record = StreakRecord.derive(windowOf(12), [
      betOn('2026-10-16'),
      betOn('2026-10-13'),
      betOn('2026-10-10'),
      betOn('2026-10-06'),
    ]);

    expect(record.closedStreaks.map((streak) => [streak.lengthInDays, streak.lastDayKey])).toEqual([
      [3, '2026-10-09'],
      [2, '2026-10-15'],
      [2, '2026-10-12'],
    ]);
  });

  it('ignores bet days outside the window', () => {
    const record = StreakRecord.derive(windowOf(5), [betOn('2026-01-01')]);

    expect(record.betDayCount).toBe(0);
    expect(record.betFreeDayCount).toBe(5);
  });

  it('lists the most recent days newest first, today included', () => {
    const record = StreakRecord.derive(windowOf(10), [betOn('2026-10-16')]);

    expect(record.recentDays(3)).toEqual([
      { dayKey: TODAY, hasBet: false },
      { dayKey: '2026-10-16', hasBet: true },
      { dayKey: '2026-10-15', hasBet: false },
    ]);
  });
});
