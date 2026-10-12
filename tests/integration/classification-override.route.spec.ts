import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import {
  aBet,
  aPurchase,
  authoriseConsent,
  BOOKMAKER_DOCUMENT,
  daysAgo,
  ingestAndClassify,
  registerBookmaker,
  registerCaller,
} from './ledger-fixture.js';
import { createTestApp } from './test-app.js';

const LEDGER_PATH = '/api/v1/transactions';
const SUMMARY_PATH = '/api/v1/transactions/monthly-summary';

function overridePath(transactionId: string): string {
  return `/api/v1/transactions/${transactionId}/classification-override`;
}

let userId: string;
let token: string;
let checkingId: string;
let betId: string;
let groceryId: string;

beforeEach(async () => {
  await registerBookmaker();
  const caller = await registerCaller('ana@exemplo.com');
  userId = caller.userId;
  token = caller.token;

  const accounts = await authoriseConsent(userId);
  checkingId = accounts.checkingId;

  const ids = await ingestAndClassify(userId, [
    aBet(checkingId, -50000, daysAgo(2, 21, 0)),
    aPurchase(accounts.cardId, -18740, daysAgo(3, 19, 0)),
  ]);

  betId = ids[0] ?? '';
  groceryId = ids[1] ?? '';
});

function override(transactionId: string): request.Test {
  return request(createTestApp())
    .post(overridePath(transactionId))
    .set('Authorization', `Bearer ${token}`)
    .send({ verdict: 'NOT_A_BET' });
}

function revert(transactionId: string): request.Test {
  return request(createTestApp())
    .delete(overridePath(transactionId))
    .set('Authorization', `Bearer ${token}`);
}

function ledger(query = ''): request.Test {
  return request(createTestApp())
    .get(`${LEDGER_PATH}${query}`)
    .set('Authorization', `Bearer ${token}`);
}

describe('POST /api/v1/transactions/{id}/classification-override', () => {
  it('answers with the row stripped of its bet and its reframing', async () => {
    const response = await override(betId);

    expect(response.status).toBe(200);
    expect(response.body.transaction).toEqual({
      id: betId,
      bet: null,
      yieldEquivalent: null,
    });
    expect(response.body.override.verdict).toBe('NOT_A_BET');
    expect(response.body.override.isReversible).toBe(true);
  });

  it('takes the row out of the bets filter', async () => {
    await override(betId);

    const bets = await ledger('?type=BETS');

    expect(bets.body.items).toEqual([]);
  });

  it('drops the betting total and the month that counted it', async () => {
    const before = await ledger();
    expect(before.body.totals.betSpend.amountInCents).toBe(50000);

    await override(betId);

    const after = await ledger();
    const charts = await request(createTestApp())
      .get(SUMMARY_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(after.body.totals.betSpend.amountInCents).toBe(0);
    expect(after.body.totals.betCount).toBe(0);
    expect(charts.body.items[0].totals.BETS).toBe(0);
  });

  it('leaves the row visible, under its own category', async () => {
    await override(betId);

    const response = await ledger();
    const items = response.body.items as { id: string; bet: unknown; override: { verdict: string } }[];
    const corrected = items.find((item) => item.id === betId);

    expect(corrected?.bet).toBeNull();
    expect(corrected?.override.verdict).toBe('NOT_A_BET');
  });

  it('refuses a transaction that was never called a bet', async () => {
    const response = await override(groceryId);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('NOT_CLASSIFIED_AS_BET');
    expect(response.body.error.message).toBe('Essa transação não está marcada como aposta.');
  });

  it('refuses a second correction', async () => {
    await override(betId);

    const again = await override(betId);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_OVERRIDDEN');
  });

  it('answers another user transaction exactly as a missing one', async () => {
    const stranger = await registerCaller('bruno@exemplo.com');

    const response = await request(createTestApp())
      .post(overridePath(betId))
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ verdict: 'NOT_A_BET' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('keeps the reason out of every response', async () => {
    const response = await request(createTestApp())
      .post(overridePath(betId))
      .set('Authorization', `Bearer ${token}`)
      .send({ verdict: 'NOT_A_BET', reason: 'É uma transferência para minha mãe' });

    expect(JSON.stringify(response.body)).not.toContain('mãe');

    const rows = await ledger();
    expect(JSON.stringify(rows.body)).not.toContain('mãe');
  });

  it('refuses a body carrying a field the server decides', async () => {
    const response = await request(createTestApp())
      .post(overridePath(betId))
      .set('Authorization', `Bearer ${token}`)
      .send({ verdict: 'NOT_A_BET', overriddenAt: '2020-01-01T00:00:00.000Z' });

    expect(response.status).toBe(422);
  });

  it('survives a re-ingestion and a re-run of the policy chain', async () => {
    await override(betId);

    await ingestAndClassify(userId, [aBet(checkingId, -50000, daysAgo(2, 21, 0))]);

    const stored = await prisma.transactionClassification.findFirstOrThrow({
      where: { transactionId: betId },
    });

    expect(stored.overrideVerdict).toBe('NOT_A_BET');
    expect(stored.matchedBy).toBe('GAMBLING_MCC');
  });
});

describe('DELETE /api/v1/transactions/{id}/classification-override', () => {
  it('restores the verdict and the reframing', async () => {
    await override(betId);

    const response = await revert(betId);

    expect(response.status).toBe(200);
    expect(response.body.transaction.bet).toEqual({
      matchedBy: 'GAMBLING_MCC',
      confidence: 'HIGH',
      source: 'POLICY',
    });
    expect(response.body.transaction.yieldEquivalent).toEqual({
      amountInCents: 55700,
      currency: 'BRL',
    });
    expect(response.body.override).toBeNull();
  });

  it('puts the row and the total back', async () => {
    await override(betId);
    await revert(betId);

    const response = await ledger();

    expect(response.body.totals.betSpend.amountInCents).toBe(50000);
  });

  it('refuses when there is no correction to undo', async () => {
    const response = await revert(betId);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('OVERRIDE_NOT_FOUND');
  });

  it('re-reads the registry, so a bookmaker added since yields the current verdict', async () => {
    // A transaction the chain could not see at the time: no MCC, and the
    // operator was not yet in the registry.
    const [unknownId = ''] = await ingestAndClassify(userId, [
      {
        accountId: checkingId,
        occurredAt: daysAgo(4, 20, 0),
        amountInCents: -25000,
        counterparty: 'Vela Bets',
        category: 'TRANSFER',
        method: 'PIX',
        status: 'SETTLED',
        counterpartyDocument: '44555666000172',
        description: 'PIX ENVIADO',
      },
    ]);

    const before = await ledger();
    const beforeItems = before.body.items as { id: string; bet: unknown }[];

    expect(beforeItems.find((item) => item.id === unknownId)?.bet).toBeNull();

    // It becomes a bet, is corrected, and the correction is undone after the
    // registry has moved on.
    await prisma.bookmaker.create({
      data: {
        id: '0192f3c1-7a1b-7c3e-9f20-00000000beef',
        tradeName: 'Vela Bets',
        document: '44555666000172',
        registeredAt: new Date(),
      },
    });
    await ingestAndClassify(userId, []);

    const { PrismaTransactionClassificationRepository } = await import(
      '@modules/bet-detection/infrastructure/prisma-transaction-classification.repository.js'
    );
    const { PrismaBookmakerRepository } = await import(
      '@modules/bet-detection/infrastructure/prisma-bookmaker.repository.js'
    );
    const { ClassifyTransaction } = await import('@modules/bet-detection/index.js');
    const { InProcessEventBus } = await import('@shared/infrastructure/in-process-event-bus.js');
    const { logger } = await import('@shared/infrastructure/logger.js');
    const { SystemClock } = await import('@shared/infrastructure/system-clock.js');

    await new ClassifyTransaction({
      classifications: new PrismaTransactionClassificationRepository(prisma),
      bookmakers: new PrismaBookmakerRepository(prisma),
      clock: new SystemClock(),
      events: new InProcessEventBus(logger),
    }).execute({
      userId,
      transactionId: unknownId,
      counterpartyDocument: '44555666000172',
      description: 'PIX ENVIADO',
    });

    const stored = await prisma.transactionClassification.findFirstOrThrow({
      where: { transactionId: unknownId },
    });

    expect(stored.matchedBy).toBe('LICENSED_CNPJ');
    expect(stored.confidence).toBe('MEDIUM');
    expect(BOOKMAKER_DOCUMENT).toHaveLength(14);
  });
});

describe('GET /api/v1/accounts', () => {
  it('lists the accounts behind the filter', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toEqual({
      id: expect.any(String),
      institution: 'Banco Andorinha',
      shortName: 'Andorinha',
      product: 'Conta corrente',
      maskedNumber: '•• 4471',
      kind: 'CHECKING',
    });
  });

  it('shows at most the last four digits, here and in the database', async () => {
    const stored = await prisma.connectedAccount.findMany({ where: { userId } });

    for (const account of stored) {
      expect(account.maskedNumber.replace(/\D/g, '')).toHaveLength(4);
    }
  });

  it('answers an empty list for somebody with no consent', async () => {
    const stranger = await registerCaller('bruno@exemplo.com');

    const response = await request(createTestApp())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${stranger.token}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('refuses a request with no session', async () => {
    expect((await request(createTestApp()).get('/api/v1/accounts')).status).toBe(401);
  });
});
