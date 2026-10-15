import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import {
  aBet,
  aPurchase,
  authoriseConsent,
  daysAgo,
  ingestAndClassify,
  registerBookmaker,
  registerCaller,
  type SeededTransaction,
} from './ledger-fixture.js';
import { createTestApp, TEST_OPEN_FINANCE } from './test-app.js';

const LEDGER_PATH = '/api/v1/transactions';

let userId: string;
let token: string;
let checkingId: string;
let cardId: string;

function ledger(query = ''): request.Test {
  return request(createTestApp())
    .get(`${LEDGER_PATH}${query}`)
    .set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  await registerBookmaker();
  const caller = await registerCaller('ana@exemplo.com');
  userId = caller.userId;
  token = caller.token;
});

async function connectAndSeed(rows: (ids: {
  checkingId: string;
  cardId: string;
}) => readonly SeededTransaction[]): Promise<void> {
  const accounts = await authoriseConsent(userId);
  checkingId = accounts.checkingId;
  cardId = accounts.cardId;
  await ingestAndClassify(userId, rows({ checkingId, cardId }));
}

describe('GET /api/v1/transactions', () => {
  describe('before anything is connected', () => {
    it('answers 200 with NO_CONSENT rather than an error or a zeroed hero', async () => {
      const response = await ledger();

      expect(response.status).toBe(200);
      expect(response.body.syncStatus).toBe('NO_CONSENT');
      expect(response.body.items).toEqual([]);
      expect(response.body.lastSyncedAt).toBeNull();
    });

    it('answers SYNCING while the first ingestion has not finished', async () => {
      await authoriseConsent(userId, { synced: false });

      const response = await ledger();

      expect(response.body.syncStatus).toBe('SYNCING');
    });

    it('refuses a request with no session', async () => {
      const response = await request(createTestApp()).get(LEDGER_PATH);

      expect(response.status).toBe(401);
    });
  });

  describe('with a statement', () => {
    beforeEach(async () => {
      await connectAndSeed(({ checkingId: checking, cardId: card }) => [
        aBet(checking, -50000, daysAgo(1, 21, 47)),
        aBet(checking, -30000, daysAgo(2, 20, 0)),
        aPurchase(card, -18740, daysAgo(2, 19, 12)),
        {
          accountId: checking,
          occurredAt: daysAgo(3, 9, 5),
          amountInCents: 328000,
          counterparty: 'Salário',
          category: 'INCOME',
          method: 'TRANSFER',
          status: 'SETTLED',
          description: 'CREDITO SALARIO',
        },
      ]);
    });

    it('answers newest first with the totals for the whole slice', async () => {
      const response = await ledger();

      expect(response.status).toBe(200);
      expect(response.body.syncStatus).toBe('READY');
      expect(response.body.items).toHaveLength(4);
      expect(response.body.items[0].counterparty).toBe('Aposta Andorinha');
      expect(response.body.totals.betSpend).toEqual({ amountInCents: 80000, currency: 'BRL' });
      expect(response.body.totals.betCount).toBe(2);
      expect(response.body.totals.credits).toEqual({ amountInCents: 328000, currency: 'BRL' });
      expect(response.body.totals.debits).toEqual({ amountInCents: 98740, currency: 'BRL' });
    });

    it('reframes the betting total with the rate awareness holds', async () => {
      const response = await ledger();

      // 80000 at 11,4% for twelve months.
      expect(response.body.totals.betYieldEquivalent).toEqual({
        amountInCents: 89120,
        currency: 'BRL',
      });
      expect(response.body.totals.annualRatePercent).toBe(11.4);
    });

    it('carries the reason and the confidence on a betting row, and null on the rest', async () => {
      const response = await ledger();
      const bet = response.body.items[0];
      const salary = response.body.items[3];

      expect(bet.bet).toEqual({
        matchedBy: 'GAMBLING_MCC',
        confidence: 'HIGH',
        source: 'POLICY',
      });
      expect(bet.yieldEquivalent).toEqual({ amountInCents: 55700, currency: 'BRL' });
      expect(salary.bet).toBeNull();
      expect(salary.yieldEquivalent).toBeNull();
    });

    it('never sends the raw description, under any field name', async () => {
      const response = await ledger();
      const body: string = JSON.stringify(response.body);

      expect(body).not.toContain('description');
      expect(body).not.toContain('PIX ENVIADO');
      expect(body).not.toContain('CREDITO SALARIO');
    });

    it('buckets the day in São Paulo, not in UTC', async () => {
      const response = await ledger();
      const row = response.body.items[0];
      const localDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(row.occurredAt));

      expect(row.dayKey).toBe(localDay);
      expect(row.monthKey).toBe(localDay.slice(0, 7));
    });

    it('keeps the sign on a row and reports the totals as magnitudes', async () => {
      const response = await ledger();

      expect(response.body.items[0].amount.amountInCents).toBeLessThan(0);
      expect(response.body.totals.debits.amountInCents).toBeGreaterThan(0);
    });

    describe('filters', () => {
      it('restricts the rows and the totals together', async () => {
        const response = await ledger('?type=BETS');

        expect(response.body.items).toHaveLength(2);
        expect(response.body.totals.betSpend.amountInCents).toBe(80000);
        expect(response.body.totals.credits.amountInCents).toBe(0);
      });

      it('finds a counterparty typed without its accents', async () => {
        const response = await ledger('?q=pao de acucar');

        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].counterparty).toBe('Supermercado Pão de Açúcar');
      });

      it('finds rows by institution, case-insensitively', async () => {
        const response = await ledger('?q=ANDORINHA');

        expect(response.body.items.length).toBeGreaterThan(0);
      });

      it('restricts to one account', async () => {
        const response = await ledger(`?accountId=${cardId}`);

        expect(response.body.items).toHaveLength(1);
        expect(response.body.totals.debits.amountInCents).toBe(18740);
      });

      it('answers 404 for an account the caller does not own, never 403', async () => {
        const stranger = await registerCaller('bruno@exemplo.com');
        const theirs = await authoriseConsent(stranger.userId);

        const response = await ledger(`?accountId=${theirs.checkingId}`);

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('ACCOUNT_NOT_FOUND');
      });

      it('refuses a limit outside its bounds', async () => {
        expect((await ledger('?limit=101')).status).toBe(422);
        expect((await ledger('?limit=0')).status).toBe(422);
      });
    });

    describe('pagination', () => {
      it('keeps the totals identical on every page of the same query', async () => {
        const first = await ledger('?limit=2');
        const second = await ledger(`?limit=2&cursor=${String(first.body.nextCursor)}`);

        expect(first.body.items).toHaveLength(2);
        expect(second.body.items).toHaveLength(2);
        expect(second.body.totals).toEqual(first.body.totals);
      });

      it('yields no duplicate and no skipped row', async () => {
        const first = await ledger('?limit=2');
        const second = await ledger(`?limit=2&cursor=${String(first.body.nextCursor)}`);
        const ids: string[] = [...first.body.items, ...second.body.items].map(
          (item: { id: string }) => item.id,
        );

        expect(new Set(ids).size).toBe(4);
        expect(second.body.nextCursor).toBeNull();
      });

      it('refuses a cursor it did not issue', async () => {
        const response = await ledger('?cursor=nao-e-um-cursor');

        expect(response.status).toBe(422);
      });
    });

    it('never shows another user a row', async () => {
      const stranger = await registerCaller('bruno@exemplo.com');

      const response = await request(createTestApp())
        .get(LEDGER_PATH)
        .set('Authorization', `Bearer ${stranger.token}`);

      expect(response.body.items).toEqual([]);
    });
  });

  describe('the period window', () => {
    it('includes a transaction 29 days old and excludes one 30 days old', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(29, 12, 0)),
        aBet(checking, -20000, daysAgo(30, 12, 0)),
      ]);

      const response = await ledger('?period=LAST_30_DAYS');

      expect(response.body.items).toHaveLength(1);
      expect(response.body.totals.betSpend.amountInCents).toBe(10000);
    });

    it('reaches the whole history when asked for all of it', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(29, 12, 0)),
        aBet(checking, -20000, daysAgo(30, 12, 0)),
      ]);

      const response = await ledger('?period=ALL_TIME');

      expect(response.body.items).toHaveLength(2);
    });

    /**
     * The betting screen links here with the window it was showing. A link
     * that widened the period would show a different total for the same
     * sentence the reader just read.
     */
    it('applies the same day rule to the 180-day window', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(179, 12, 0)),
        aBet(checking, -20000, daysAgo(180, 12, 0)),
      ]);

      const response = await ledger('?period=LAST_180_DAYS');

      expect(response.body.items).toHaveLength(1);
      expect(response.body.totals.betSpend.amountInCents).toBe(10000);
    });

    it('applies the same day rule to the 360-day window', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(359, 12, 0)),
        aBet(checking, -20000, daysAgo(360, 12, 0)),
      ]);

      const response = await ledger('?period=LAST_360_DAYS');

      expect(response.body.items).toHaveLength(1);
      expect(response.body.totals.betSpend.amountInCents).toBe(10000);
    });
  });

  describe('one bookmaker at a time', () => {
    async function bookmakerIdOf(): Promise<string> {
      const response = await request(createTestApp())
        .get('/api/v1/bets/summary?days=360')
        .set('Authorization', `Bearer ${token}`);

      const houses: readonly { readonly bookmakerId: string }[] = response.body.bookmakers;

      return houses[0]?.bookmakerId ?? '';
    }

    it('returns that house debits and refunds, netted in the totals', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(5, 12, 0)),
        aBet(checking, -10000, daysAgo(4, 12, 0)),
        { ...aBet(checking, 5000, daysAgo(3, 12, 0)), description: 'ESTORNO PIX' },
        aPurchase(checking, -18740, daysAgo(2, 12, 0)),
      ]);

      const response = await ledger(
        `?type=BETS&period=LAST_30_DAYS&bookmakerId=${await bookmakerIdOf()}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(3);
      expect(response.body.totals.betSpend.amountInCents).toBe(15000);
    });

    it('answers newest first, as every other page does', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(5, 12, 0)),
        aBet(checking, -20000, daysAgo(2, 12, 0)),
      ]);

      const response = await ledger(
        `?type=BETS&period=LAST_30_DAYS&bookmakerId=${await bookmakerIdOf()}`,
      );

      expect(response.body.items[0].amount.amountInCents).toBe(-20000);
    });

    it('answers 404 for a house that is not in this reader history', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(5, 12, 0)),
      ]);

      const response = await ledger('?bookmakerId=bkm_unregistered_deadbeef');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('BOOKMAKER_NOT_FOUND');
      expect(response.body.error.message).toBe('Não encontramos essa casa de apostas.');
    });

    it('answers 404 for another reader house, never 403', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(5, 12, 0)),
      ]);
      const bookmakerId = await bookmakerIdOf();

      const other = await registerCaller('bruno@exemplo.com');
      const response = await request(createTestApp())
        .get(`${LEDGER_PATH}?bookmakerId=${bookmakerId}`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('BOOKMAKER_NOT_FOUND');
    });
  });

  describe('refunds and pending entries', () => {
    it('nets a bookmaker refund off the betting total', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -50000, daysAgo(2, 21, 0)),
        { ...aBet(checking, 12000, daysAgo(1, 14, 0)), description: 'ESTORNO PIX' },
      ]);

      const response = await ledger();

      expect(response.body.totals.betSpend.amountInCents).toBe(38000);
      // The refund is not a bet placed.
      expect(response.body.totals.betCount).toBe(1);
    });

    it('never reports a negative betting total', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -10000, daysAgo(2, 21, 0)),
        { ...aBet(checking, 50000, daysAgo(1, 14, 0)), description: 'ESTORNO PIX' },
      ]);

      const response = await ledger();

      expect(response.body.totals.betSpend.amountInCents).toBe(0);
    });

    it('counts a pending entry in the rows and in the totals', async () => {
      await connectAndSeed(({ cardId: card }) => [
        { ...aPurchase(card, -9990, daysAgo(1, 18, 0)), status: 'PENDING' as const },
      ]);

      const response = await ledger();

      expect(response.body.items[0].status).toBe('PENDING');
      expect(response.body.totals.debits.amountInCents).toBe(9990);
    });
  });

  describe('after the consent is revoked', () => {
    it('answers NO_CONSENT, and the rows are gone from the database', async () => {
      await connectAndSeed(({ checkingId: checking }) => [
        aBet(checking, -50000, daysAgo(1, 21, 0)),
      ]);

      await request(createTestApp())
        .post('/api/v1/identity/sessions')
        .send({ email: 'ana@exemplo.com', password: 'quatro palavras comuns' });

      // Revocation runs through the aggregate, which records the event whose
      // subscriber deletes everything derived from the consent.
      const { ConsentRevoked } = await import('@modules/open-finance/index.js');
      const { UniqueEntityId } = await import('@shared/domain/unique-entity-id.js');
      const consent = await prisma.consent.findFirstOrThrow({ where: { userId } });
      const { InProcessEventBus } = await import('@shared/infrastructure/in-process-event-bus.js');
      const { logger } = await import('@shared/infrastructure/logger.js');
      const { PurgeUserFinancialData } = await import('@modules/open-finance/index.js');
      const { ForgetUserClassifications } = await import('@modules/bet-detection/index.js');
      const { PrismaTransactionRepository } = await import(
        '@modules/open-finance/infrastructure/prisma-transaction.repository.js'
      );
      const { PrismaConnectedAccountRepository } = await import(
        '@modules/open-finance/infrastructure/prisma-connected-account.repository.js'
      );
      const { PrismaTransactionClassificationRepository } = await import(
        '@modules/bet-detection/infrastructure/prisma-transaction-classification.repository.js'
      );

      const bus = new InProcessEventBus(logger);
      const { PrismaConsentTokenVault } = await import(
        '@modules/open-finance/infrastructure/prisma-consent-token-vault.js'
      );
      const { PrismaAuthorisationRequestRepository } = await import(
        '@modules/open-finance/infrastructure/prisma-authorisation-request.repository.js'
      );
      const { AesGcmTokenCipher } = await import(
        '@modules/open-finance/infrastructure/aes-gcm-token-cipher.js'
      );
      const cipher = new AesGcmTokenCipher(TEST_OPEN_FINANCE.tokenEncryptionKey);

      const purge = new PurgeUserFinancialData({
        transactions: new PrismaTransactionRepository(prisma, () => new Date()),
        accounts: new PrismaConnectedAccountRepository(prisma),
        tokens: new PrismaConsentTokenVault(prisma, cipher),
        authorisationRequests: new PrismaAuthorisationRequestRepository(prisma, cipher),
      });
      const forget = new ForgetUserClassifications(
        new PrismaTransactionClassificationRepository(prisma),
      );
      bus.subscribe(ConsentRevoked.NAME, async (event) => {
        if (!(event instanceof ConsentRevoked)) {
          return;
        }

        await purge.execute({ userId: event.payload.userId });
        await forget.execute({ userId: event.payload.userId });
      });

      await prisma.consent.update({ where: { id: consent.id }, data: { status: 'REVOKED' } });
      await bus.publish([
        new ConsentRevoked({
          userId: UniqueEntityId.restore(userId),
          consentId: UniqueEntityId.restore(consent.id),
          revokedAt: new Date(),
        }),
      ]);

      const response = await ledger();

      expect(response.body.syncStatus).toBe('NO_CONSENT');
      expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
      expect(await prisma.transactionClassification.count({ where: { userId } })).toBe(0);
    });
  });
});
