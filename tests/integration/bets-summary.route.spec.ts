import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import {
  aBet,
  aBetByDocument,
  aBetByKeyword,
  anIncome,
  aPurchase,
  aRefund,
  authoriseConsent,
  daysAgo,
  ingestAndClassify,
  inMonthsAgo,
  registerBookmaker,
  registerCaller,
  registerReferenceItems,
  type SeededTransaction,
} from './ledger-fixture.js';
import { createTestApp } from './test-app.js';

interface HourBand {
  readonly startHour: number;
  readonly count: number;
}

interface CatalogueEntry {
  readonly id: string;
  readonly quantity: number;
  readonly target: { readonly amountInCents: number; readonly currency: string };
  readonly reviewedAt: string;
}

const SUMMARY_PATH = '/api/v1/bets/summary';
const LEDGER_PATH = '/api/v1/transactions';

let userId: string;
let token: string;
let checkingId: string;
let cardId: string;

function summary(query = ''): request.Test {
  return request(createTestApp())
    .get(`${SUMMARY_PATH}${query}`)
    .set('Authorization', `Bearer ${token}`);
}

function ledger(query: string): request.Test {
  return request(createTestApp())
    .get(`${LEDGER_PATH}${query}`)
    .set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  await registerBookmaker();
  await registerReferenceItems();
  const caller = await registerCaller('ana@exemplo.com');
  userId = caller.userId;
  token = caller.token;
});

async function connectAndSeed(
  rows: (ids: { checkingId: string; cardId: string }) => readonly SeededTransaction[],
): Promise<void> {
  const accounts = await authoriseConsent(userId);
  checkingId = accounts.checkingId;
  cardId = accounts.cardId;
  await ingestAndClassify(userId, rows({ checkingId, cardId }));
}

describe('GET /api/v1/bets/summary', () => {
  describe('the window', () => {
    it('answers the 360-day window when days is omitted', async () => {
      const response = await summary();

      expect(response.status).toBe(200);
      expect(response.body.window.days).toBe(360);
    });

    it('refuses a window the screen does not offer', async () => {
      const response = await summary('?days=45');

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.message).toBe('Não conseguimos aplicar esse período.');
    });

    it('opens the window 359 days before it closes', async () => {
      const response = await summary('?days=360');
      const { fromDayKey, toDayKey } = response.body.window;
      const spanInDays =
        (Date.parse(`${toDayKey}T00:00:00Z`) - Date.parse(`${fromDayKey}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000);

      expect(spanInDays).toBe(359);
    });

    it('counts a bet 29 days old and leaves out one 30 days old', async () => {
      await connectAndSeed(({ cardId: card }) => [
        aBet(card, -10_000, daysAgo(29)),
        aBet(card, -70_000, daysAgo(30)),
      ]);

      const response = await summary('?days=30');

      expect(response.body.cost.total.amountInCents).toBe(10_000);
      expect(response.body.cost.transactionCount).toBe(1);
    });
  });

  describe('the cost', () => {
    it('nets a refund out of the total and reports it separately', async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(card, -10_000, daysAgo(10)),
        aBet(card, -10_000, daysAgo(9)),
        aRefund(checking, 5_000, daysAgo(8)),
      ]);

      const response = await summary('?days=30');

      expect(response.body.cost.total).toEqual({ amountInCents: 15_000, currency: 'BRL' });
      expect(response.body.cost.transactionCount).toBe(2);
      expect(response.body.cost.refunds).toEqual({
        total: { amountInCents: 5_000, currency: 'BRL' },
        count: 1,
      });
    });

    it('never answers a negative total, however large the refund', async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(card, -10_000, daysAgo(10)),
        aRefund(checking, 40_000, daysAgo(8)),
      ]);

      const response = await summary('?days=30');

      expect(response.body.cost.total.amountInCents).toBe(0);
    });

    it('reports the oldest bet placed in the window', async () => {
      const when = daysAgo(20, 21, 47);
      await connectAndSeed(({ cardId: card }) => [
        aBet(card, -10_000, when),
        aBet(card, -10_000, daysAgo(2)),
      ]);

      const response = await summary('?days=30');

      expect(response.body.cost.firstBetAt).toBe(when.toISOString());
    });
  });

  /**
   * The invariant the whole feature rests on. Two screens that disagree about
   * the same money discredit both of them, so this is asserted against the real
   * statement endpoint rather than against a recomputation.
   */
  describe('agreement with the statement', () => {
    const PERIODS = [
      [30, 'LAST_30_DAYS'],
      [90, 'LAST_90_DAYS'],
      [180, 'LAST_180_DAYS'],
      [360, 'LAST_360_DAYS'],
    ] as const;

    beforeEach(async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(card, -12_000, daysAgo(2)),
        aBetByDocument(checking, -30_000, daysAgo(40)),
        aBetByKeyword(checking, -7_500, daysAgo(120)),
        aBet(card, -50_000, daysAgo(300)),
        aRefund(checking, 4_000, daysAgo(35)),
        aPurchase(card, -18_740, daysAgo(5)),
      ]);
    });

    it.each(PERIODS)(
      'answers the same betting total as the statement for %i days',
      async (days, period) => {
        const summarised = await summary(`?days=${String(days)}`);
        const listed = await ledger(`?type=BETS&period=${period}&limit=100`);

        expect(summarised.body.cost.total).toEqual(listed.body.totals.betSpend);
      },
    );

    it('answers the same total per bookmaker as the statement filtered by it', async () => {
      const summarised = await summary('?days=360');

      for (const bookmaker of summarised.body.bookmakers) {
        const listed = await ledger(
          `?type=BETS&period=LAST_360_DAYS&limit=100&bookmakerId=${String(bookmaker.bookmakerId)}`,
        );

        expect(listed.status).toBe(200);
        expect(listed.body.totals.betSpend).toEqual(bookmaker.total);
      }
    });
  });

  describe('the bookmakers', () => {
    it('collapses two spellings of one registered number into one house', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBetByDocument(checking, -10_000, daysAgo(10), 'ANDORINHA'),
        aBetByDocument(checking, -15_000, daysAgo(9), 'Andorinha*Pix'),
      ]);

      const response = await summary('?days=30');

      expect(response.body.bookmakers).toHaveLength(1);
      expect(response.body.bookmakers[0].transactionCount).toBe(2);
      expect(response.body.bookmakers[0].name).toBe('Aposta Andorinha');
      expect(response.body.bookmakers[0].registryStatus).toBe('REGISTERED');
    });

    it('gives two keyword matches of one name a single, stable id', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBetByKeyword(checking, -5_000, daysAgo(10)),
        aBetByKeyword(checking, -2_500, daysAgo(9)),
      ]);

      const first = await summary('?days=30');
      const second = await summary('?days=30');

      expect(first.body.bookmakers).toHaveLength(1);
      expect(first.body.bookmakers[0].registryStatus).toBe('UNREGISTERED');
      expect(first.body.bookmakers[0].transactionCount).toBe(2);
      expect(second.body.bookmakers[0].bookmakerId).toBe(first.body.bookmakers[0].bookmakerId);
    });

    it('still lists a fully refunded house, at zero', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBetByDocument(checking, -7_500, daysAgo(10)),
        aRefund(checking, 7_500, daysAgo(9)),
      ]);

      const response = await summary('?days=30');

      expect(response.body.bookmakers).toHaveLength(1);
      expect(response.body.bookmakers[0].total.amountInCents).toBe(0);
    });

    it('reports the weakest confidence with the reason that earned it', async () => {
      // One house reached two ways: nine card payments caught by the MCC, and
      // one PIX caught by the line alone. It is not a `HIGH` house, and it is
      // not a `GAMBLING_MCC`/`LOW` house either.
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        ...Array.from({ length: 9 }, (_unused, index) =>
          aBet(card, -10_000, daysAgo(10 + index)),
        ),
        aBetByKeyword(checking, -1_000, daysAgo(9), 'Aposta Andorinha'),
      ]);

      const house = (await summary('?days=30')).body.bookmakers[0];

      expect(house.transactionCount).toBe(10);
      expect(house.weakest).toEqual({ matchedBy: 'DESCRIPTION_KEYWORD', confidence: 'LOW' });
      expect(house.detections).toEqual([
        { matchedBy: 'GAMBLING_MCC', count: 9, lowestConfidence: 'HIGH' },
        { matchedBy: 'DESCRIPTION_KEYWORD', count: 1, lowestConfidence: 'LOW' },
      ]);
    });
  });

  describe('the tallies and the hours', () => {
    it('counts a bet at 23:30 in São Paulo in the 21h band', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -10_000, daysAgo(3, 23, 30))]);

      const response = await summary('?days=30');
      const bands: readonly HourBand[] = response.body.hourBuckets;

      expect(bands).toHaveLength(8);
      expect(bands.map((band) => band.startHour)).toEqual([
        0, 3, 6, 9, 12, 15, 18, 21,
      ]);
      expect(bands[7]?.count).toBe(1);
    });

    it('counts a bet at 00:10 in São Paulo in the 0h band', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -10_000, daysAgo(3, 0, 10))]);

      expect((await summary('?days=30')).body.hourBuckets[0].count).toBe(1);
    });

    it('lets a refund change neither a tally nor an hour', async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(card, -10_000, daysAgo(3, 21, 30)),
        aRefund(checking, 4_000, daysAgo(2, 9, 30)),
      ]);

      const response = await summary('?days=30');
      const bands: readonly HourBand[] = response.body.hourBuckets;
      const counted = bands.reduce(
        (sum, band) => sum + band.count,
        0,
      );

      expect(counted).toBe(1);
      expect(response.body.detectionTallies).toEqual([
        { matchedBy: 'GAMBLING_MCC', count: 1, sharePercent: 100 },
      ]);
    });
  });

  describe('the share of income', () => {
    it('counts INCOME credits only', async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(card, -20_000, daysAgo(10)),
        anIncome(checking, 100_000, daysAgo(12)),
        // Neither of these is money that came in.
        aRefund(checking, 50_000, daysAgo(9)),
        {
          ...anIncome(checking, 80_000, daysAgo(8)),
          counterparty: 'Transferência entre contas',
          category: 'TRANSFER',
        },
      ]);

      const response = await summary('?days=30');

      expect(response.body.incomeShare.income.amountInCents).toBe(100_000);
    });

    it('is hidden when nothing came in during the window', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -20_000, daysAgo(10))]);

      expect((await summary('?days=30')).body.incomeShare).toBeNull();
    });

    it('states a share above 100 as it is', async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(card, -200_000, daysAgo(10)),
        anIncome(checking, 100_000, daysAgo(12)),
      ]);

      expect((await summary('?days=30')).body.incomeShare.percentage).toBe(200);
    });
  });

  describe('the reframing and the equivalences', () => {
    it('reframes the net total at the rate awareness holds', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -100_000, daysAgo(10))]);

      const response = await summary('?days=30');

      expect(response.body.yield.annualRatePercent).toBe(11.4);
      expect(response.body.yield.betYieldEquivalent.amountInCents).toBe(111_400);
    });

    it('divides the total into whole catalogue units, priciest first', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -853_000, daysAgo(10))]);

      const items: readonly CatalogueEntry[] = (await summary('?days=30')).body.equivalences
        .referenceItems;

      expect(items.map((item) => [item.id, item.quantity])).toEqual(
        [
          ['notebook', 3],
          ['passagem', 9],
        ],
      );
      expect(items[0]?.target).toEqual({ amountInCents: 750_000, currency: 'BRL' });
      expect(items[0]?.reviewedAt).toBe('2026-10-01');
    });

    it('omits an item the total does not buy one of', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -232_000, daysAgo(10))]);

      const items: readonly CatalogueEntry[] = (await summary('?days=30')).body.equivalences
        .referenceItems;

      expect(items.map((item) => item.id)).toEqual(['passagem']);
    });

    it('reflects a corrected price with no deploy', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -500_000, daysAgo(10))]);
      await prisma.referenceItem.update({
        where: { id: 'notebook' },
        data: { unitPriceInCents: 100_000 },
      });

      const items: readonly CatalogueEntry[] = (await summary('?days=30')).body.equivalences
        .referenceItems;

      expect(items[0]).toMatchObject({ id: 'notebook', quantity: 5 });
    });

    it('averages own spending over complete months only', async () => {
      await connectAndSeed(({ cardId: card }) => [
        aBet(card, -900_000, daysAgo(2)),
        // One complete month with groceries, and the partial current month
        // with a much smaller run that must not drag the average down.
        aPurchase(card, -50_000, inMonthsAgo(1)),
        aPurchase(card, -1_000, inMonthsAgo(0)),
      ]);

      const [groceries] = (await summary('?days=360')).body.equivalences.ownSpending;

      expect(groceries.category).toBe('GROCERIES');
      expect(groceries.completeMonthsCounted).toBeGreaterThan(0);
      expect(groceries.monthlyAverage.amountInCents * groceries.completeMonthsCounted).toBe(50_000);
    });
  });

  describe('what it refuses to leak', () => {
    beforeEach(async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(card, -10_000, daysAgo(3)),
        aBetByDocument(checking, -20_000, daysAgo(4)),
        aBetByKeyword(checking, -5_000, daysAgo(5)),
      ]);
    });

    it('carries no registration number, statement line or account number', async () => {
      const body = JSON.stringify((await summary('?days=30')).body);

      expect(body).not.toContain('11222333000181');
      expect(body).not.toContain('PIX ENVIADO');
      expect(body).not.toContain('PIX Aposta esportiva');
      expect(body).not.toContain('4471');
    });

    it('never shows another reader figures', async () => {
      const other = await registerCaller('bruno@exemplo.com');
      const accounts = await authoriseConsent(other.userId);
      await ingestAndClassify(other.userId, [aBet(accounts.cardId, -900_000, daysAgo(3))]);

      const response = await summary('?days=30');

      expect(response.body.cost.total.amountInCents).toBe(35_000);
    });

    it('requires a session', async () => {
      const response = await request(createTestApp()).get(SUMMARY_PATH);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('SESSION_INVALID');
    });
  });

  describe('after the reader changes something', () => {
    it('drops a corrected row from every figure', async () => {
      const accounts = await authoriseConsent(userId);
      const transactionIds = await ingestAndClassify(userId, [
        aBet(accounts.cardId, -10_000, daysAgo(3)),
        aBet(accounts.cardId, -40_000, daysAgo(4)),
      ]);

      await request(createTestApp())
        .post(`/api/v1/transactions/${String(transactionIds[0])}/classification-override`)
        .set('Authorization', `Bearer ${token}`)
        .send({ verdict: 'NOT_A_BET' });

      const response = await summary('?days=30');

      expect(response.body.cost.total.amountInCents).toBe(40_000);
      expect(response.body.cost.transactionCount).toBe(1);
      expect(response.body.detectionTallies[0].count).toBe(1);
    });

    it('answers NO_CONSENT once there is no consent left, as revocation leaves it', async () => {
      await connectAndSeed(({ cardId: card }) => [aBet(card, -10_000, daysAgo(3))]);
      await prisma.transaction.deleteMany({ where: { userId } });
      await prisma.consent.deleteMany({ where: { userId } });

      const response = await summary('?days=30');

      expect(response.body.syncStatus).toBe('NO_CONSENT');
      expect(response.body.cost.total.amountInCents).toBe(0);
      expect(response.body.incomeShare).toBeNull();
    });
  });

  it('answers the same figures twice in a row', async () => {
    await connectAndSeed(({ cardId: card }) => [aBet(card, -10_000, daysAgo(3))]);

    const first = await summary('?days=30');
    const second = await summary('?days=30');

    expect(second.body).toEqual(first.body);
  });
});
