import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Calendar } from '@shared/domain/calendar.js';
import { prisma } from '@shared/infrastructure/prisma.js';
import {
  aBet,
  authoriseConsent,
  inMonthsAgo,
  ingestAndClassify,
  registerBookmaker,
  registerCaller,
} from './ledger-fixture.js';
import { createTestApp } from './test-app.js';

const CEILING_PATH = '/api/v1/betting-ceiling';
const calendar = new Calendar('America/Sao_Paulo');

let userId: string;
let token: string;

function brl(amountInCents: number): { amountInCents: number; currency: 'BRL' } {
  return { amountInCents, currency: 'BRL' };
}

function monthsAgo(count: number): string {
  return calendar.recentMonthKeys(new Date(), count + 1)[count] ?? '';
}

function describeCeiling(as = token): request.Test {
  return request(createTestApp()).get(CEILING_PATH).set('Authorization', `Bearer ${as}`);
}

function setCeiling(body: object): request.Test {
  return request(createTestApp()).put(CEILING_PATH).set('Authorization', `Bearer ${token}`).send(body);
}

/**
 * A ceiling chosen in a past month. The API only ever sets the current or the
 * next month, which is the point — so history is arranged at the table.
 */
async function aCeilingSince(monthKey: string, amountInCents: number): Promise<void> {
  await prisma.bettingCeiling.create({
    data: {
      id: randomUUID(),
      userId,
      createdAt: new Date(),
      terms: {
        create: [
          { id: randomUUID(), amountInCents, destination: 'Reserva de emergência', effectiveFrom: monthKey, setAt: new Date() },
        ],
      },
    },
  });
}

beforeEach(async () => {
  await registerBookmaker();
  const caller = await registerCaller('ana@exemplo.com');
  userId = caller.userId;
  token = caller.token;
});

describe('GET /api/v1/betting-ceiling', () => {
  it('answers NO_CONSENT with nothing measured, never a zero', async () => {
    const response = await describeCeiling();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      syncStatus: 'NO_CONSENT',
      ceiling: null,
      scheduled: null,
      current: null,
      cycles: [],
    });
    expect(response.body.simulation.steps).toEqual([]);
  });

  it('measures each month against the ceiling in force, skipping months before it', async () => {
    const { checkingId } = await authoriseConsent(userId);
    await ingestAndClassify(userId, [
      aBet(checkingId, -40_000, inMonthsAgo(0)),
      aBet(checkingId, -164_000, inMonthsAgo(1)),
      aBet(checkingId, -90_000, inMonthsAgo(2)),
      aBet(checkingId, -500_000, inMonthsAgo(3)),
    ]);
    await aCeilingSince(monthsAgo(2), 100_000);

    const response = await describeCeiling();

    expect(response.status).toBe(200);
    expect(response.body.syncStatus).toBe('READY');
    expect(response.body.current).toMatchObject({
      monthKey: monthsAgo(0),
      status: 'ACTIVE',
      spent: brl(40_000),
      margin: brl(60_000),
      usedPercent: 40,
    });
    expect(response.body.current.marginYieldEquivalent.amountInCents).toBeGreaterThan(60_000);
    const cycles = z.array(z.object({ monthKey: z.string(), status: z.string() })).parse(response.body.cycles);

    expect(cycles.map((cycle) => [cycle.monthKey, cycle.status])).toEqual([
      [monthsAgo(1), 'MISSED'],
      [monthsAgo(2), 'REACHED'],
    ]);
  });

  it('simulates over the closed months, past the worst one', async () => {
    const { checkingId } = await authoriseConsent(userId);
    await ingestAndClassify(userId, [
      aBet(checkingId, -900_000, inMonthsAgo(0)),
      aBet(checkingId, -164_000, inMonthsAgo(1)),
      aBet(checkingId, -90_000, inMonthsAgo(2)),
    ]);

    const response = await describeCeiling();
    const simulation = response.body.simulation;

    expect(simulation.monthsCounted).toBe(2);
    expect(simulation.cap).toEqual(brl(170_000));
    expect(simulation.steps[0]).toMatchObject({ ceiling: brl(0), monthsWithin: 0 });
    expect(simulation.steps[simulation.steps.length - 1]).toMatchObject({ ceiling: brl(170_000), monthsWithin: 2 });
  });

  it('refuses a request with no session', async () => {
    expect((await request(createTestApp()).get(CEILING_PATH)).status).toBe(401);
  });
});

describe('PUT /api/v1/betting-ceiling', () => {
  it('applies the first ceiling to the month under way', async () => {
    const response = await setCeiling({ amount: brl(100_000), destination: 'Reserva de emergência' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ceiling: { amount: brl(100_000), destination: 'Reserva de emergência', effectiveFromMonthKey: monthsAgo(0) },
      scheduled: null,
      effectiveFromMonthKey: monthsAgo(0),
    });
  });

  it('schedules a replacement for next month and leaves this month alone', async () => {
    await setCeiling({ amount: brl(100_000) });

    const response = await setCeiling({ amount: brl(50_000) });
    const overview = await describeCeiling();

    expect(response.body.effectiveFromMonthKey).toBe(calendar.monthKeyAfter(monthsAgo(0)));
    expect(overview.body.ceiling.amount).toEqual(brl(100_000));
    expect(overview.body.scheduled.amount).toEqual(brl(50_000));
  });

  it('keeps one ceiling per person, whoever else sets theirs', async () => {
    await setCeiling({ amount: brl(100_000) });
    const somebodyElse = await registerCaller('bia@exemplo.com');

    const theirs = await describeCeiling(somebodyElse.token);

    expect(theirs.body.ceiling).toBeNull();
  });

  it('accepts a ceiling of zero', async () => {
    const response = await setCeiling({ amount: brl(0), destination: null });

    expect(response.status).toBe(200);
    expect(response.body.ceiling.amount).toEqual(brl(0));
  });

  it('refuses a negative ceiling with a message on the field', async () => {
    const response = await setCeiling({ amount: brl(-1) });

    expect(response.status).toBe(422);
    expect(Object.keys(response.body.error.details)).toEqual(['amount.amountInCents']);
  });

  it('refuses a destination past sixty characters', async () => {
    const response = await setCeiling({ amount: brl(1_000), destination: 'a'.repeat(61) });

    expect(response.status).toBe(422);
  });
});
