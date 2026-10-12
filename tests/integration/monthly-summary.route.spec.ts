import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  aBet,
  aPurchase,
  authoriseConsent,
  daysAgo,
  ingestAndClassify,
  registerBookmaker,
  registerCaller,
} from './ledger-fixture.js';
import { createTestApp } from './test-app.js';

const SUMMARY_PATH = '/api/v1/transactions/monthly-summary';
const LEDGER_PATH = '/api/v1/transactions';

const CATEGORIES = [
  'BETS',
  'GROCERIES',
  'DINING',
  'TRANSPORT',
  'HOUSING',
  'HEALTH',
  'SUBSCRIPTIONS',
  'SHOPPING',
  'INCOME',
  'TRANSFER',
  'OTHER',
] as const;

let userId: string;
let token: string;
let checkingId: string;
let cardId: string;

function summary(query = ''): request.Test {
  return request(createTestApp())
    .get(`${SUMMARY_PATH}${query}`)
    .set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  await registerBookmaker();
  const caller = await registerCaller('ana@exemplo.com');
  userId = caller.userId;
  token = caller.token;
});

describe('GET /api/v1/transactions/monthly-summary', () => {
  it('answers NO_CONSENT for somebody who has never connected an account', async () => {
    const response = await summary();

    expect(response.status).toBe(200);
    expect(response.body.syncStatus).toBe('NO_CONSENT');
    expect(response.body.items).toEqual([]);
  });

  it('refuses a request with no session', async () => {
    expect((await request(createTestApp()).get(SUMMARY_PATH)).status).toBe(401);
  });

  describe('with history', () => {
    beforeEach(async () => {
      const accounts = await authoriseConsent(userId);
      checkingId = accounts.checkingId;
      cardId = accounts.cardId;

      await ingestAndClassify(userId, [
        aBet(checkingId, -50000, daysAgo(2, 21, 0)),
        aBet(checkingId, -30000, daysAgo(5, 20, 0)),
        aPurchase(cardId, -18740, daysAgo(3, 19, 0)),
        {
          accountId: checkingId,
          occurredAt: daysAgo(4, 9, 0),
          amountInCents: 328000,
          counterparty: 'Salário',
          category: 'INCOME',
          method: 'TRANSFER',
          status: 'SETTLED',
          description: 'CREDITO SALARIO',
        },
      ]);
    });

    it('carries every category key, zeros included', async () => {
      const response = await summary();

      expect(Object.keys(response.body.items[0].totals).sort()).toEqual([...CATEGORIES].sort());
    });

    it('does not send TOTAL_SPENT, which would be a figure that could disagree', async () => {
      const response = await summary();

      expect(response.body.items[0].totals).not.toHaveProperty('TOTAL_SPENT');
    });

    it('reports every figure as a non-negative magnitude', async () => {
      const response = await summary();
      const figures = Object.values(
        response.body.items[0].totals as Record<string, number>,
      );

      expect(figures.every((figure) => figure >= 0)).toBe(true);
      expect(response.body.items[0].totals.GROCERIES).toBe(18740);
      expect(response.body.items[0].totals.INCOME).toBe(328000);
    });

    it('marks the current month partial and only that one', async () => {
      const response = await summary();

      const months = response.body.items as { isPartial: boolean; monthsAgo: number }[];

      expect(months[0]?.isPartial).toBe(true);
      expect(months[0]?.monthsAgo).toBe(0);

      for (const month of months.slice(1)) {
        expect(month.isPartial).toBe(false);
      }
    });

    it('omits months with no data rather than zero-filling twelve bars', async () => {
      const response = await summary();

      expect(response.body.items.length).toBeLessThanOrEqual(2);
    });

    it('declares the currency once for the whole response', async () => {
      const response = await summary();

      expect(response.body.currency).toBe('BRL');
      expect(typeof response.body.items[0].totals.BETS).toBe('number');
    });

    /**
     * The invariant four screens depend on. The charts and the statement are
     * two queries over the same rows, and a disagreement between them is
     * visible to the user as two different totals for the same month.
     */
    it('agrees with the statement, per calendar month', async () => {
      const charts = await summary();
      const statement = await request(createTestApp())
        .get(`${LEDGER_PATH}?type=BETS&period=ALL_TIME`)
        .set('Authorization', `Bearer ${token}`);

      const months = charts.body.items as { totals: { BETS: number } }[];
      const chartTotal = months.reduce((sum, month) => sum + month.totals.BETS, 0);

      expect(chartTotal).toBe(statement.body.totals.betSpend.amountInCents);
    });

    it('nets a refund off the month exactly as the statement does', async () => {
      await ingestAndClassify(userId, [
        { ...aBet(checkingId, 12000, daysAgo(1, 14, 0)), description: 'ESTORNO PIX' },
      ]);

      const charts = await summary();
      const statement = await request(createTestApp())
        .get(`${LEDGER_PATH}?type=BETS&period=ALL_TIME`)
        .set('Authorization', `Bearer ${token}`);

      expect(charts.body.items[0].totals.BETS).toBe(
        statement.body.totals.betSpend.amountInCents,
      );
    });

    it('counts a bet under BETS whatever category it was filed as', async () => {
      await ingestAndClassify(userId, [
        {
          ...aPurchase(cardId, -20000, daysAgo(1, 10, 0), 'Aposta Andorinha'),
          mcc: 7995,
        },
      ]);

      const response = await summary();

      // It was filed as GROCERIES but the chain called it a bet, so it counts
      // once, under BETS, and not twice.
      expect(response.body.items[0].totals.BETS).toBe(100000);
      expect(response.body.items[0].totals.GROCERIES).toBe(18740);
    });

    it('refuses a months value outside its bounds', async () => {
      expect((await summary('?months=13')).status).toBe(422);
      expect((await summary('?months=0')).status).toBe(422);
    });
  });
});
