import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  aBet,
  authoriseConsent,
  inMonthsAgo,
  ingestAndClassify,
  registerBookmaker,
  registerCaller,
} from './ledger-fixture.js';
import { createTestApp } from './test-app.js';

const SUPPORT_PATH = '/api/v1/awareness/support-offer';
const ABOVE_THE_FLOOR = -150_000;

let userId: string;
let token: string;
let checkingId: string;

function supportOffer(): request.Test {
  return request(createTestApp()).get(SUPPORT_PATH).set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  await registerBookmaker();
  const caller = await registerCaller('ana@exemplo.com');
  userId = caller.userId;
  token = caller.token;

  const accounts = await authoriseConsent(userId);
  checkingId = accounts.checkingId;
});

describe('GET /api/v1/awareness/support-offer', () => {
  describe('the negative cases, which are the ones that matter', () => {
    it('does not offer with no history', async () => {
      const response = await supportOffer();

      expect(response.status).toBe(200);
      expect(response.body.shouldOffer).toBe(false);
      expect(response.body.sustainedMonths).toBe(0);
    });

    it('does not offer after two sustained whole months', async () => {
      await ingestAndClassify(userId, [
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(1)),
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(2)),
      ]);

      const response = await supportOffer();

      expect(response.body.shouldOffer).toBe(false);
      expect(response.body.sustainedMonths).toBe(2);
    });

    it('does not let the current partial month complete a run', async () => {
      await ingestAndClassify(userId, [
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(0)),
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(1)),
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(2)),
      ]);

      const response = await supportOffer();

      expect(response.body.shouldOffer).toBe(false);
      expect(response.body.sustainedMonths).toBe(2);
    });

    it('resets the count when a month below the floor interrupts the run', async () => {
      await ingestAndClassify(userId, [
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(1)),
        aBet(checkingId, -5_000, inMonthsAgo(2)),
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(3)),
        aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(4)),
      ]);

      const response = await supportOffer();

      expect(response.body.shouldOffer).toBe(false);
      expect(response.body.sustainedMonths).toBe(1);
    });
  });

  it('offers after three consecutive whole months above the floor', async () => {
    await ingestAndClassify(userId, [
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(1)),
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(2)),
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(3)),
    ]);

    const response = await supportOffer();

    expect(response.body.shouldOffer).toBe(true);
    expect(response.body.sustainedMonths).toBe(3);
    expect(response.body.thresholdInCents).toBe(100_000);
  });

  it('reports a rising run', async () => {
    await ingestAndClassify(userId, [
      aBet(checkingId, -300_000, inMonthsAgo(1)),
      aBet(checkingId, -200_000, inMonthsAgo(2)),
      aBet(checkingId, -150_000, inMonthsAgo(3)),
    ]);

    const response = await supportOffer();

    expect(response.body.isRising).toBe(true);
  });

  it('carries no diagnosis, no risk level and no recommendation', async () => {
    const response = await supportOffer();

    expect(Object.keys(response.body).sort()).toEqual([
      'isRising',
      'shouldOffer',
      'sustainedMonths',
      'thresholdInCents',
    ]);
  });

  it('answers the same whatever the caller is looking at elsewhere', async () => {
    await ingestAndClassify(userId, [
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(1)),
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(2)),
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(3)),
    ]);

    const first = await supportOffer();
    await request(createTestApp())
      .get('/api/v1/transactions?type=CREDITS&period=LAST_30_DAYS')
      .set('Authorization', `Bearer ${token}`);
    const second = await supportOffer();

    expect(second.body).toEqual(first.body);
  });

  it('drops the offer when a correction takes a month below the floor', async () => {
    const ids = await ingestAndClassify(userId, [
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(1)),
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(2)),
      aBet(checkingId, ABOVE_THE_FLOOR, inMonthsAgo(3)),
    ]);

    expect((await supportOffer()).body.shouldOffer).toBe(true);

    await request(createTestApp())
      .post(`/api/v1/transactions/${String(ids[0])}/classification-override`)
      .set('Authorization', `Bearer ${token}`)
      .send({ verdict: 'NOT_A_BET' });

    const response = await supportOffer();

    expect(response.body.shouldOffer).toBe(false);
    expect(response.body.sustainedMonths).toBe(0);
  });

  it('refuses a request with no session', async () => {
    expect((await request(createTestApp()).get(SUPPORT_PATH)).status).toBe(401);
  });
});
