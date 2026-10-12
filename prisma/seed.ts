import { randomUUID } from 'node:crypto';
import { ClassifyTransaction } from '../src/modules/bet-detection/index.js';
import { PrismaBookmakerRepository } from '../src/modules/bet-detection/infrastructure/prisma-bookmaker.repository.js';
import { PrismaTransactionClassificationRepository } from '../src/modules/bet-detection/infrastructure/prisma-transaction-classification.repository.js';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher.js';
import { Password } from '../src/modules/identity/domain/password.js';
import { IngestTransactions, ProjectClassification } from '../src/modules/open-finance/index.js';
import { BetDetectionClassificationReader } from '../src/modules/open-finance/infrastructure/bet-detection-classification-reader.js';
import { ClassificationLookup } from '../src/modules/bet-detection/index.js';
import { PrismaConsentRepository } from '../src/modules/open-finance/infrastructure/prisma-consent.repository.js';
import { PrismaTransactionRepository } from '../src/modules/open-finance/infrastructure/prisma-transaction.repository.js';
import type { IngestedTransaction } from '../src/modules/open-finance/index.js';
import { Calendar } from '../src/shared/domain/calendar.js';
import { InProcessEventBus } from '../src/shared/infrastructure/in-process-event-bus.js';
import { logger } from '../src/shared/infrastructure/logger.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { SystemClock } from '../src/shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '../src/shared/infrastructure/uuid-v7-id-generator.js';
import { BetTransactionDetected } from '../src/modules/bet-detection/index.js';

/**
 * Synthetic data only.
 *
 * Every institution, operator and registration number below is **invented**.
 * Nothing here may look like a real bank or a real company, and no real CPF,
 * CNPJ, name or bank movement ever enters this repository.
 *
 * The seed goes through the same use cases the product does — the consent gate,
 * the policy chain and the projection — so what it produces is reachable by the
 * same rules a real ingestion would obey, rather than rows pushed past them.
 */

const DEMO_EMAIL = 'ana@exemplo.com';
const DEMO_PASSWORD = 'quatro palavras comuns';
const DEMO_NAME = 'Ana';
const MONTHS_OF_HISTORY = 12;
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

/** Invented operators. The documents are placeholders, not anybody's CNPJ. */
const BOOKMAKERS: readonly { readonly tradeName: string; readonly document: string }[] = [
  { tradeName: 'Aposta Andorinha', document: '11222333000181' },
  { tradeName: 'Vela Bets', document: '44555666000172' },
  { tradeName: 'Gaivota Sports', document: '77888999000163' },
];

const clock = new SystemClock();
const calendar = new Calendar('America/Sao_Paulo');
const idGenerator = new UuidV7IdGenerator(clock);
const eventBus = new InProcessEventBus(logger);

interface SeededTransaction extends IngestedTransaction {
  readonly mcc: number | null;
  readonly counterpartyDocument: string | null;
  readonly description: string;
}

function at(daysAgo: number, hour: number, minute: number): Date {
  const start = calendar.startOfDaysBefore(clock.now(), daysAgo);

  return new Date(start.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

/** A month of ordinary life, so the betting series reads as the anomaly. */
function ordinaryMonth(accountId: string, cardId: string, monthsAgo: number): SeededTransaction[] {
  const base = monthsAgo * 30;

  return [
    {
      accountId,
      occurredAt: at(base + 25, 9, 5),
      amountInCents: 328000,
      counterparty: 'Salário',
      category: 'INCOME',
      method: 'TRANSFER',
      status: 'SETTLED',
      mcc: null,
      counterpartyDocument: null,
      description: 'CREDITO SALARIO',
    },
    {
      accountId,
      occurredAt: at(base + 24, 10, 30),
      amountInCents: -158730,
      counterparty: 'Aluguel',
      category: 'HOUSING',
      method: 'PIX',
      status: 'SETTLED',
      mcc: null,
      counterpartyDocument: null,
      description: 'PIX ALUGUEL',
    },
    {
      accountId: cardId,
      occurredAt: at(base + 20, 19, 12),
      amountInCents: -18740,
      counterparty: 'Supermercado Pão de Açúcar',
      category: 'GROCERIES',
      method: 'CREDIT_CARD',
      status: 'SETTLED',
      mcc: 5411,
      counterpartyDocument: null,
      description: 'SUPERMERCADO PAO DE ACUCAR',
    },
    {
      accountId: cardId,
      occurredAt: at(base + 14, 12, 40),
      amountInCents: -5350,
      counterparty: 'Padaria Betânia',
      category: 'DINING',
      method: 'CREDIT_CARD',
      status: 'SETTLED',
      mcc: 5812,
      counterpartyDocument: null,
      description: 'PADARIA BETANIA',
    },
    {
      accountId,
      occurredAt: at(base + 11, 8, 15),
      amountInCents: -7430,
      counterparty: 'Transporte urbano',
      category: 'TRANSPORT',
      method: 'DEBIT_CARD',
      status: 'SETTLED',
      mcc: 4111,
      counterpartyDocument: null,
      description: 'BILHETE UNICO',
    },
    {
      accountId: cardId,
      occurredAt: at(base + 6, 21, 2),
      amountInCents: -7780,
      counterparty: 'Serviço de streaming',
      category: 'SUBSCRIPTIONS',
      method: 'CREDIT_CARD',
      status: 'SETTLED',
      mcc: 5815,
      counterpartyDocument: null,
      description: 'ASSINATURA MENSAL',
    },
  ];
}

/**
 * A rising betting series, because that is the shape the product exists to make
 * visible. Each month is matched by a different policy, so every badge and
 * every explanation on the screen has a row behind it.
 */
function bettingMonth(accountId: string, monthsAgo: number): SeededTransaction[] {
  const base = monthsAgo * 30;
  const intensity = Math.max(MONTHS_OF_HISTORY - monthsAgo, 1);
  const bets: SeededTransaction[] = [];
  const perBet = 5000 + intensity * 2500;

  for (let index = 0; index < Math.min(2 + Math.floor(intensity / 3), 6); index += 1) {
    const bookmaker = BOOKMAKERS[index % BOOKMAKERS.length];

    bets.push({
      accountId,
      occurredAt: at(base + 22 - index * 4, 21, 47),
      amountInCents: -(perBet + index * 1500),
      counterparty: bookmaker?.tradeName ?? 'Aposta Andorinha',
      category: 'BETS',
      method: 'PIX',
      status: 'SETTLED',
      // Rotating the signal so all three policies and all three confidences
      // appear in the data the screens render.
      mcc: index % 3 === 0 ? 7995 : null,
      counterpartyDocument: index % 3 === 1 ? (bookmaker?.document ?? null) : null,
      description: index % 3 === 2 ? 'PIX APOSTA ESPORTIVA' : 'PIX ENVIADO',
    });
  }

  return bets;
}

async function ensureDemoUser(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

  if (existing !== null) {
    return existing.id;
  }

  const password = Password.create(DEMO_PASSWORD);

  if (!password.ok) {
    throw new Error('the demo password must satisfy the policy');
  }

  const hash = await new Argon2PasswordHasher().hash(password.value);
  const now = clock.now();
  const user = await prisma.user.create({
    data: {
      id: idGenerator.generate().value,
      displayName: DEMO_NAME,
      email: DEMO_EMAIL,
      passwordHash: hash.value,
      registeredAt: now,
      consentAcceptedAt: now,
      consentPolicyVersion: '2026-10-01',
      consentScope: 'NAME_AND_EMAIL',
    },
  });

  return user.id;
}

async function ensureBookmakers(): Promise<void> {
  for (const bookmaker of BOOKMAKERS) {
    await prisma.bookmaker.upsert({
      where: { document: bookmaker.document },
      create: {
        id: randomUUID(),
        tradeName: bookmaker.tradeName,
        document: bookmaker.document,
        registeredAt: clock.now(),
      },
      update: { tradeName: bookmaker.tradeName },
    });
  }
}

async function resetFinancialData(userId: string): Promise<void> {
  await prisma.transactionClassification.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.connectedAccount.deleteMany({ where: { userId } });
  await prisma.consent.deleteMany({ where: { userId } });
}

async function connectAccounts(userId: string): Promise<{
  readonly consentId: string;
  readonly checkingId: string;
  readonly cardId: string;
}> {
  const now = clock.now();
  const consentId = idGenerator.generate().value;

  await prisma.consent.create({
    data: {
      id: consentId,
      userId,
      status: 'AUTHORISED',
      createdAt: new Date(now.getTime() - MONTHS_OF_HISTORY * 30 * MILLISECONDS_IN_A_DAY),
      expiresAt: new Date(now.getTime() + 180 * MILLISECONDS_IN_A_DAY),
      lastSyncedAt: null,
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
        institution: 'Banco Andorinha',
        shortName: 'Andorinha',
        product: 'Conta corrente',
        // Masked at ingestion: only the last four digits ever exist here.
        maskedNumber: '•• 4471',
        kind: 'CHECKING',
        connectedAt: new Date(now.getTime() - 200 * MILLISECONDS_IN_A_DAY),
      },
      {
        id: cardId,
        userId,
        consentId,
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

function buildHistory(checkingId: string, cardId: string): readonly SeededTransaction[] {
  const history: SeededTransaction[] = [];

  for (let monthsAgo = 0; monthsAgo < MONTHS_OF_HISTORY; monthsAgo += 1) {
    history.push(...ordinaryMonth(checkingId, cardId, monthsAgo));
    history.push(...bettingMonth(checkingId, monthsAgo));
  }

  // The two cases the product has to get right and nothing else produces:
  // a bookmaker refund, which nets off the betting total rather than inflating
  // it, and a pending entry, which is counted and may yet change value.
  history.push({
    accountId: checkingId,
    occurredAt: at(9, 14, 20),
    amountInCents: 12000,
    counterparty: 'Aposta Andorinha',
    category: 'BETS',
    method: 'PIX',
    status: 'SETTLED',
    mcc: 7995,
    counterpartyDocument: null,
    description: 'ESTORNO PIX',
  });

  history.push({
    accountId: cardId,
    occurredAt: at(1, 18, 5),
    amountInCents: -9990,
    counterparty: 'Loja de departamento',
    category: 'SHOPPING',
    method: 'CREDIT_CARD',
    status: 'PENDING',
    mcc: 5651,
    counterpartyDocument: null,
    description: 'COMPRA PARCELADA',
  });

  return history;
}

async function seed(): Promise<void> {
  await ensureBookmakers();

  const userId = await ensureDemoUser();
  await resetFinancialData(userId);

  const { checkingId, cardId } = await connectAccounts(userId);
  const history = buildHistory(checkingId, cardId);

  const consents = new PrismaConsentRepository(prisma);
  const transactions = new PrismaTransactionRepository(prisma, () => clock.now());
  const classifications = new PrismaTransactionClassificationRepository(prisma);
  const bookmakers = new PrismaBookmakerRepository(prisma);

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
    consents,
    transactions,
    idGenerator,
    clock,
    events: eventBus,
  }).execute({ userId, transactions: history });

  if (!ingested.ok) {
    throw new Error(`ingestion refused: ${ingested.error.code}`);
  }

  const classify = new ClassifyTransaction({ classifications, bookmakers, clock, events: eventBus });

  // Ingestion and detection are two steps on purpose: the signals the chain
  // reads, the raw statement line included, never enter `open-finance`.
  for (const [index, transactionId] of ingested.value.transactionIds.entries()) {
    const row = history[index];

    if (row === undefined) {
      continue;
    }

    await classify.execute({
      userId,
      transactionId,
      mcc: row.mcc,
      counterpartyDocument: row.counterpartyDocument,
      description: row.description,
    });
  }

  process.stdout.write(
    `seeded ${String(history.length)} synthetic transactions for ${DEMO_EMAIL}\n`,
  );
  process.stdout.write(`sign in with: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

await seed();
await prisma.$disconnect();
