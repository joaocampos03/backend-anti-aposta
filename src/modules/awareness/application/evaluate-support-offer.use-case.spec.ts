import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '@shared/domain/calendar.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { HIGH_BAND_FLOOR_IN_CENTS } from '../domain/support-offer.js';
import { InMemoryMonthlyBetSpendReader } from '../infrastructure/in-memory/in-memory-monthly-bet-spend-reader.js';
import { EvaluateSupportOffer } from './evaluate-support-offer.use-case.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77';
// Mid-October: September is the latest whole month.
const NOW = new Date('2026-10-11T15:00:00.000Z');
const ABOVE = HIGH_BAND_FLOOR_IN_CENTS + 50_000;

let reader: InMemoryMonthlyBetSpendReader;
let evaluateSupportOffer: EvaluateSupportOffer;

beforeEach(() => {
  reader = new InMemoryMonthlyBetSpendReader();
  evaluateSupportOffer = new EvaluateSupportOffer(
    reader,
    new Calendar('America/Sao_Paulo'),
    new FixedClock(NOW),
  );
});

describe('EvaluateSupportOffer', () => {
  it('offers after three sustained whole months', async () => {
    reader.record(USER_ID, '2026-09', ABOVE);
    reader.record(USER_ID, '2026-08', ABOVE);
    reader.record(USER_ID, '2026-07', ABOVE);

    const result = await evaluateSupportOffer.execute({ userId: USER_ID });

    expect(result.ok && result.value).toEqual({
      shouldOffer: true,
      sustainedMonths: 3,
      isRising: false,
      thresholdInCents: HIGH_BAND_FLOOR_IN_CENTS,
    });
  });

  it('does not let the current partial month complete a run', async () => {
    // October is still running: two whole months plus a high October is not three.
    reader.record(USER_ID, '2026-10', ABOVE);
    reader.record(USER_ID, '2026-09', ABOVE);
    reader.record(USER_ID, '2026-08', ABOVE);

    const result = await evaluateSupportOffer.execute({ userId: USER_ID });

    expect(result.ok && result.value.shouldOffer).toBe(false);
    expect(result.ok && result.value.sustainedMonths).toBe(2);
  });

  it('treats a month with no data as a month below the floor', async () => {
    reader.record(USER_ID, '2026-09', ABOVE);
    reader.record(USER_ID, '2026-07', ABOVE);
    reader.record(USER_ID, '2026-06', ABOVE);

    const result = await evaluateSupportOffer.execute({ userId: USER_ID });

    expect(result.ok && result.value.sustainedMonths).toBe(1);
  });

  it('answers the same thing for a user with no history', async () => {
    const result = await evaluateSupportOffer.execute({ userId: USER_ID });

    expect(result.ok && result.value.shouldOffer).toBe(false);
  });

  it('reports a rising run', async () => {
    reader.record(USER_ID, '2026-09', 300_000);
    reader.record(USER_ID, '2026-08', 200_000);
    reader.record(USER_ID, '2026-07', 150_000);

    const result = await evaluateSupportOffer.execute({ userId: USER_ID });

    expect(result.ok && result.value.isRising).toBe(true);
  });

  it('sees only the caller own months', async () => {
    reader.record('someone-else', '2026-09', ABOVE);
    reader.record('someone-else', '2026-08', ABOVE);
    reader.record('someone-else', '2026-07', ABOVE);

    const result = await evaluateSupportOffer.execute({ userId: USER_ID });

    expect(result.ok && result.value.shouldOffer).toBe(false);
  });
});
