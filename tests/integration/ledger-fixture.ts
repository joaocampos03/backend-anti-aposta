import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import {
  ClassificationLookup,
  ClassifyTransaction,
  BetTransactionDetected,
} from '@modules/bet-detection/index.js';
import { PrismaBookmakerRepository } from '@modules/bet-detection/infrastructure/prisma-bookmaker.repository.js';
import { PrismaTransactionClassificationRepository } from '@modules/bet-detection/infrastructure/prisma-transaction-classification.repository.js';
import { IngestTransactions, ProjectClassification } from '@modules/open-finance/index.js';
import { BetDetectionClassificationReader } from '@modules/open-finance/infrastructure/bet-detection-classification-reader.js';
import { PrismaConsentRepository } from '@modules/open-finance/infrastructure/prisma-consent.repository.js';
import { PrismaTransactionRepository } from '@modules/open-finance/infrastructure/prisma-transaction.repository.js';
import type { IngestedTransaction } from '@modules/open-finance/index.js';
import { Calendar } from '@shared/domain/calendar.js';
import { InProcessEventBus } from '@shared/infrastructure/in-process-event-bus.js';
import { logger } from '@shared/infrastructure/logger.js';
import { prisma } from '@shared/infrastructure/prisma.js';
import { SystemClock } from '@shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '@shared/infrastructure/uuid-v7-id-generator.js';
import { createTestApp, VALID_REGISTRATION } from './test-app.js';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export const BOOKMAKER_DOCUMENT = '11222333000181';

export interface SeededSignals {
  readonly mcc?: number | null;
  readonly counterpartyDocument?: string | null;
  readonly description?: string;
}

/** The DataHolder's id is generated when a test does not care which it is. */
export type SeededTransaction = Omit<IngestedTransaction, 'externalId'> & {
  readonly externalId?: string;
} & SeededSignals;

export interface LedgerFixture {
  readonly userId: string;
  readonly token: string;
  readonly consentId: string;
  readonly checkingId: string;
  readonly cardId: string;
}

const clock = new SystemClock();
const calendar = new Calendar('America/Sao_Paulo');
const idGenerator = new UuidV7IdGenerator(clock);

/** Registers through the real endpoint, so the session is a real session. */
export async function registerCaller(email: string): Promise<{ userId: string; token: string }> {
  const response = await request(createTestApp())
    .post('/api/v1/identity/users')
    .send({ ...VALID_REGISTRATION, email });

  expect(response.status).toBe(201);

  const userId: unknown = response.body.user.id;
  const token: unknown = response.body.session.token;

  return {
    userId: typeof userId === 'string' ? userId : '',
    token: typeof token === 'string' ? token : '',
  };
}

export async function registerBookmaker(): Promise<void> {
  await prisma.bookmaker.upsert({
    where: { document: BOOKMAKER_DOCUMENT },
    create: {
      id: randomUUID(),
      tradeName: 'Aposta Andorinha',
      document: BOOKMAKER_DOCUMENT,
      registeredAt: clock.now(),
    },
    update: {},
  });
}

/**
 * The equivalence catalogue, as the seed writes it. Two items, priced so a test
 * can do the division in its head.
 */
export async function registerReferenceItems(): Promise<void> {
  await prisma.referenceItem.createMany({
    data: [
      {
        id: 'notebook',
        singular: 'notebook',
        plural: 'notebooks',
        unitPriceInCents: 250_000,
        source: 'Estimativa arredondada para a demonstração',
        reviewedAt: '2026-10-01',
        isActive: true,
      },
      {
        id: 'passagem',
        singular: 'passagem aérea',
        plural: 'passagens aéreas',
        unitPriceInCents: 90_000,
        source: 'Estimativa arredondada para a demonstração',
        reviewedAt: '2026-10-01',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });
}

export async function authoriseConsent(
  userId: string,
  options: { readonly synced?: boolean } = {},
): Promise<{ consentId: string; checkingId: string; cardId: string }> {
  const now = clock.now();
  const consentId = idGenerator.generate().value;

  await prisma.consent.create({
    data: {
      id: consentId,
      userId,
      externalConsentId: `urn:sandbox-bank:${consentId}`,
      status: 'AUTHORISED',
      createdAt: new Date(now.getTime() - 365 * MILLISECONDS_IN_A_DAY),
      expiresAt: new Date(now.getTime() + 180 * MILLISECONDS_IN_A_DAY),
      lastSyncedAt: options.synced === false ? null : now,
    },
  });

  const checkingId = idGenerator.generate().value;
  const cardId = idGenerator.generate().value;

  await prisma.connectedAccount.createMany({
    data: [
      {
        id: checkingId,
        userId,
        consentId,
        externalId: `bank-${checkingId}`,
        institution: 'Banco Andorinha',
        shortName: 'Andorinha',
        product: 'Conta corrente',
        maskedNumber: '•• 4471',
        kind: 'CHECKING',
        connectedAt: new Date(now.getTime() - 200 * MILLISECONDS_IN_A_DAY),
      },
      {
        id: cardId,
        userId,
        consentId,
        externalId: `bank-${cardId}`,
        institution: 'Vela Crédito',
        shortName: 'Vela',
        product: 'Cartão de crédito',
        maskedNumber: '•• 8032',
        kind: 'CREDIT_CARD',
        connectedAt: new Date(now.getTime() - 150 * MILLISECONDS_IN_A_DAY),
      },
    ],
  });

  return { consentId, checkingId, cardId };
}

/**
 * Ingests and classifies through the real use cases, including the projection
 * that keeps `open-finance`'s copy of the verdict current. A test that wrote
 * the rows directly would prove nothing about the path the product takes.
 */
export async function ingestAndClassify(
  userId: string,
  rows: readonly SeededTransaction[],
): Promise<readonly string[]> {
  const eventBus = new InProcessEventBus(logger);
  const transactions = new PrismaTransactionRepository(prisma, () => clock.now());
  const classifications = new PrismaTransactionClassificationRepository(prisma);
  const projectClassification = new ProjectClassification(
    transactions,
    new BetDetectionClassificationReader(new ClassificationLookup(classifications)),
  );

  eventBus.subscribe(BetTransactionDetected.NAME, async (event) => {
    if (!(event instanceof BetTransactionDetected)) {
      return;
    }

    await projectClassification.execute({
      userId: event.payload.userId,
      transactionId: event.payload.transactionId,
    });
  });

  const ingested = await new IngestTransactions({
    consents: new PrismaConsentRepository(prisma),
    transactions,
    idGenerator,
    clock,
    events: eventBus,
  }).execute({
    userId,
    transactions: rows.map((row) => ({ ...row, externalId: row.externalId ?? randomUUID() })),
  });

  if (!ingested.ok) {
    throw new Error(`ingestion refused: ${ingested.error.code}`);
  }

  const classify = new ClassifyTransaction({
    classifications,
    bookmakers: new PrismaBookmakerRepository(prisma),
    clock,
    events: eventBus,
  });

  for (const [index, transactionId] of ingested.value.transactionIds.entries()) {
    const row = rows[index];

    if (row === undefined) {
      continue;
    }

    await classify.execute({
      userId,
      transactionId,
      mcc: row.mcc ?? null,
      counterpartyDocument: row.counterpartyDocument ?? null,
      description: row.description ?? '',
      counterparty: row.counterparty,
    });
  }

  return ingested.value.transactionIds;
}

/**
 * Days before now, at a local hour.
 *
 * It walks local calendar days through the Calendar rather than subtracting
 * milliseconds and nudging the UTC hour: the two disagree whenever the test
 * runs between local midnight and 03:00, which is the window the São Paulo
 * bucketing exists to get right in the first place.
 */
export function daysAgo(days: number, hour = 12, minute = 0): Date {
  const startOfThatDay = calendar.startOfDaysBefore(clock.now(), days);

  return new Date(startOfThatDay.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

/**
 * An instant inside the local month `monthsAgo` months back, on its 10th, so a
 * test can place a row in a known calendar month without arithmetic that
 * breaks at a boundary.
 */
export function inMonthsAgo(monthsAgo: number, hour = 21): Date {
  const keys = calendar.recentMonthKeys(clock.now(), monthsAgo + 1);
  const monthKey = keys[monthsAgo] ?? keys[0] ?? calendar.monthKeyOf(clock.now());
  const start = calendar.startOfMonth(monthKey);

  return new Date(start.getTime() + 9 * MILLISECONDS_IN_A_DAY + hour * 60 * 60 * 1000);
}

export function aBet(accountId: string, amountInCents: number, when: Date): SeededTransaction {
  return {
    accountId,
    occurredAt: when,
    amountInCents,
    counterparty: 'Aposta Andorinha',
    category: 'BETS',
    method: 'PIX',
    status: 'SETTLED',
    mcc: 7995,
    description: 'PIX ENVIADO',
  };
}

/**
 * A bookmaker hiding behind a generic line: only the registration number gives
 * it away, so the grouping has to come from the registry and the name with it.
 */
export function aBetByDocument(
  accountId: string,
  amountInCents: number,
  when: Date,
  counterparty = 'PIX ENVIADO',
): SeededTransaction {
  return {
    accountId,
    occurredAt: when,
    amountInCents,
    counterparty,
    category: 'TRANSFER',
    method: 'PIX',
    status: 'SETTLED',
    counterpartyDocument: BOOKMAKER_DOCUMENT,
    description: 'PIX ENVIADO',
  };
}

/** Caught by the line alone: no registry entry, so the name is the counterparty. */
export function aBetByKeyword(
  accountId: string,
  amountInCents: number,
  when: Date,
  counterparty = 'Esportes da Sorte',
): SeededTransaction {
  return {
    accountId,
    occurredAt: when,
    amountInCents,
    counterparty,
    category: 'OTHER',
    method: 'PIX',
    status: 'SETTLED',
    description: 'PIX Aposta esportiva',
  };
}

/** Money a house gave back. Classified like any movement with that house. */
export function aRefund(
  accountId: string,
  amountInCents: number,
  when: Date,
): SeededTransaction {
  return {
    accountId,
    occurredAt: when,
    amountInCents,
    counterparty: 'Aposta Andorinha',
    category: 'INCOME',
    method: 'PIX',
    status: 'SETTLED',
    counterpartyDocument: BOOKMAKER_DOCUMENT,
    description: 'ESTORNO PIX',
  };
}

export function anIncome(
  accountId: string,
  amountInCents: number,
  when: Date,
): SeededTransaction {
  return {
    accountId,
    occurredAt: when,
    amountInCents,
    counterparty: 'Salário',
    category: 'INCOME',
    method: 'TRANSFER',
    status: 'SETTLED',
    description: 'SALARIO',
  };
}

export function aPurchase(
  accountId: string,
  amountInCents: number,
  when: Date,
  counterparty = 'Supermercado Pão de Açúcar',
): SeededTransaction {
  return {
    accountId,
    occurredAt: when,
    amountInCents,
    counterparty,
    category: 'GROCERIES',
    method: 'CREDIT_CARD',
    status: 'SETTLED',
    mcc: 5411,
    description: 'SUPERMERCADO',
  };
}
