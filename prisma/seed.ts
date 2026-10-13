import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { buildContainer } from '../src/container.js';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher.js';
import { Password } from '../src/modules/identity/domain/password.js';
import { DemoAccountOpening } from '../src/modules/sandbox-bank/application/demo-account-opening.js';
import type { RecordLedgerEntryInput } from '../src/modules/sandbox-bank/application/dto/bank-app.dto.js';
import { RecordLedgerEntry } from '../src/modules/sandbox-bank/application/record-ledger-entry.use-case.js';
import { CryptoBankSecrets } from '../src/modules/sandbox-bank/infrastructure/crypto-bank-secrets.js';
import { PrismaBankAccountRepository } from '../src/modules/sandbox-bank/infrastructure/prisma-bank-account.repository.js';
import { PrismaLedgerEntryRepository } from '../src/modules/sandbox-bank/infrastructure/prisma-ledger-entry.repository.js';
import { PrismaSandboxConsentRepository } from '../src/modules/sandbox-bank/infrastructure/prisma-sandbox-consent.repository.js';
import { ConfiguredClientRegistry } from '../src/modules/sandbox-bank/infrastructure/configured-client-registry.js';
import { HttpDataRecipientNotifier } from '../src/modules/sandbox-bank/infrastructure/http-data-recipient-notifier.js';
import { CONSENT_URN_PREFIX } from '../src/modules/sandbox-bank/http/sandbox-bank.schemas.js';
import { CreateInbox } from '../src/modules/notifications/application/create-inbox.use-case.js';
import { PrismaInboxRepository } from '../src/modules/notifications/infrastructure/prisma-inbox.repository.js';
import { UniqueEntityId } from '../src/shared/domain/unique-entity-id.js';
import { Calendar } from '../src/shared/domain/calendar.js';
import { env, sandboxLedgerWritesEnabled } from '../src/shared/infrastructure/env.js';
import { logger } from '../src/shared/infrastructure/logger.js';
import { prisma } from '../src/shared/infrastructure/prisma.js';
import { SystemClock } from '../src/shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '../src/shared/infrastructure/uuid-v7-id-generator.js';

/**
 * Synthetic data only.
 *
 * Every institution, operator and registration number below is **invented**.
 * Nothing here may look like a real bank or a real company, and no real CPF,
 * CNPJ, name or bank movement ever enters this repository.
 *
 * The seed has two halves, and they never touch each other's tables:
 *
 * 1. **The bank.** A year of movements is booked at `sandbox-bank`, as its own
 *    back office would book them.
 * 2. **The platform.** The demo user then connects that bank exactly as a
 *    person would — consent, the bank's authorisation screen, the PKCE code
 *    exchange, the first synchronisation — over real HTTP against a copy of
 *    this API started for the purpose. What lands in `open-finance` got there
 *    through the consent gate, the policy chain and the projection.
 *
 * `npm run db:seed -- --without-consent` stops after the bank, so the connect
 * flow can be demonstrated on screen from the start.
 */

const DEMO_EMAIL = 'ana@exemplo.com';
const DEMO_PASSWORD = 'quatro palavras comuns';
const DEMO_NAME = 'Ana';
const MONTHS_OF_HISTORY = 12;
const WITHOUT_CONSENT = process.argv.includes('--without-consent');

/** Invented operators. The documents are placeholders, not anybody's CNPJ. */
const BOOKMAKERS: readonly { readonly tradeName: string; readonly document: string }[] = [
  { tradeName: 'Aposta Andorinha', document: '11222333000181' },
  { tradeName: 'Vela Bets', document: '44555666000172' },
  { tradeName: 'Gaivota Sports', document: '77888999000163' },
];

const clock = new SystemClock();
const calendar = new Calendar('America/Sao_Paulo');
const idGenerator = new UuidV7IdGenerator(clock);

type Entry = Omit<RecordLedgerEntryInput, 'customerId' | 'accountId'> & {
  readonly on: 'CHECKING' | 'CARD';
};

function at(daysAgo: number, hour: number, minute: number): Date {
  const start = calendar.startOfDaysBefore(clock.now(), daysAgo);

  return new Date(start.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

function entry(
  on: Entry['on'],
  bookedAt: Date,
  amountInCents: number,
  transactionName: string,
  details: Partial<Pick<Entry, 'type' | 'status' | 'merchantCategoryCode' | 'payeeDocument'>> = {},
): Entry {
  return {
    on,
    bookedAt,
    amountInCents,
    transactionName,
    type: details.type ?? (on === 'CARD' ? 'CARTAO' : 'PIX'),
    status: details.status ?? 'TRANSACAO_EFETIVADA',
    merchantCategoryCode: details.merchantCategoryCode ?? null,
    payeeDocument: details.payeeDocument ?? null,
  };
}

/** A month of ordinary life, so the betting series reads as the anomaly. */
function ordinaryMonth(monthsAgo: number): Entry[] {
  const base = monthsAgo * 30;

  return [
    entry('CHECKING', at(base + 25, 9, 5), 328000, 'Salário', { type: 'FOLHA_PAGAMENTO' }),
    entry('CHECKING', at(base + 24, 10, 30), -158730, 'Aluguel'),
    entry('CARD', at(base + 20, 19, 12), -18740, 'Supermercado Pão de Açúcar', {
      merchantCategoryCode: 5411,
    }),
    // A merchant whose name contains "bet": the keyword policy must leave it alone.
    entry('CARD', at(base + 14, 12, 40), -5350, 'Padaria Betânia', { merchantCategoryCode: 5812 }),
    entry('CHECKING', at(base + 11, 8, 15), -7430, 'Transporte urbano', {
      type: 'CARTAO',
      merchantCategoryCode: 4111,
    }),
    entry('CARD', at(base + 6, 21, 2), -7780, 'Serviço de streaming', {
      merchantCategoryCode: 5815,
    }),
  ];
}

/**
 * A rising betting series, because that is the shape the product exists to make
 * visible. Each bet is matched by a different policy — MCC on a card payment,
 * the operator's CNPJ behind a generic PIX line, a keyword in the line itself —
 * so every badge and every explanation on the screen has a row behind it.
 */
function bettingMonth(monthsAgo: number): Entry[] {
  const base = monthsAgo * 30;
  const intensity = Math.max(MONTHS_OF_HISTORY - monthsAgo, 1);
  const perBet = 5000 + intensity * 2500;
  const bets: Entry[] = [];

  for (let index = 0; index < Math.min(2 + Math.floor(intensity / 3), 6); index += 1) {
    const bookmaker = BOOKMAKERS[index % BOOKMAKERS.length] ?? BOOKMAKERS[0];
    const when = at(base + 22 - index * 4, 21, 47);
    const amount = -(perBet + index * 1500);

    bets.push(betSignalledBy(index % 3, when, amount, bookmaker?.tradeName ?? '', bookmaker?.document ?? null));
  }

  return bets;
}

function betSignalledBy(
  policy: number,
  when: Date,
  amountInCents: number,
  tradeName: string,
  document: string | null,
): Entry {
  if (policy === 0) {
    return entry('CARD', when, amountInCents, tradeName, { merchantCategoryCode: 7995 });
  }

  if (policy === 1) {
    // A bookmaker hiding behind a generic line: only the CNPJ gives it away.
    return entry('CHECKING', when, amountInCents, 'PIX ENVIADO', { payeeDocument: document });
  }

  return entry('CHECKING', when, amountInCents, 'PIX Aposta esportiva');
}

function buildHistory(): readonly Entry[] {
  const history: Entry[] = [];

  for (let monthsAgo = 0; monthsAgo < MONTHS_OF_HISTORY; monthsAgo += 1) {
    history.push(...ordinaryMonth(monthsAgo), ...bettingMonth(monthsAgo));
  }

  // The two cases the product has to get right and nothing else produces: a
  // bookmaker refund, which nets off the betting total rather than inflating
  // it, and an entry booked for the future, which may yet change.
  history.push(
    entry('CHECKING', at(9, 14, 20), 12000, 'ESTORNO PIX', { payeeDocument: '11222333000181' }),
    entry('CARD', at(1, 18, 5), -9990, 'Loja de departamento', {
      merchantCategoryCode: 5651,
      status: 'LANCAMENTO_FUTURO',
    }),
  );

  return history;
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

/** Both sides start clean: the platform's derived data, and the bank's ledger. */
async function resetDemoData(userId: string): Promise<void> {
  await prisma.transactionClassification.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.connectedAccount.deleteMany({ where: { userId } });
  await prisma.consent.deleteMany({ where: { userId } });
  await prisma.sandboxLedgerEntry.deleteMany({ where: { customerId: userId } });
  await prisma.sandboxBankAccount.deleteMany({ where: { customerId: userId } });
}

/** Half one: the bank books a year of movements, through its own use cases. */
async function bookAtTheBank(userId: string): Promise<number> {
  const accounts = new PrismaBankAccountRepository(prisma);
  const opened = await new DemoAccountOpening(accounts, new CryptoBankSecrets(), idGenerator).ensureFor(
    UniqueEntityId.restore(userId),
    clock.now(),
  );
  const checking = opened.find((account) => !account.isCreditCard());
  const card = opened.find((account) => account.isCreditCard());

  if (checking === undefined || card === undefined) {
    throw new Error('the sandbox opens a checking account and a card');
  }

  // The history is booked before any consent shares these accounts, so the
  // bank has nobody to notify yet; the notifier is the real one regardless.
  const record = new RecordLedgerEntry({
    accounts,
    ledger: new PrismaLedgerEntryRepository(prisma),
    consents: new PrismaSandboxConsentRepository(prisma),
    clients: new ConfiguredClientRegistry(platformClient(env.OPEN_FINANCE_NOTICE_URI), env.OPEN_FINANCE_CLIENT_SECRET),
    notifier: new HttpDataRecipientNotifier(
      { consentUrnPrefix: CONSENT_URN_PREFIX, clientSecret: env.OPEN_FINANCE_CLIENT_SECRET },
      logger,
    ),
    idGenerator,
    clock,
  });
  const history = buildHistory();

  for (const { on, ...row } of history) {
    const booked = await record.execute({
      ...row,
      customerId: userId,
      accountId: (on === 'CARD' ? card : checking).id.value,
    });

    if (!booked.ok) {
      throw new Error(`the bank refused a seeded entry: ${booked.error.code}`);
    }
  }

  return history.length;
}

async function call(baseUrl: string, path: string, init: RequestInit & { readonly token?: string }): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
    },
  });
  const body: unknown = await response.json();

  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} answered ${String(response.status)}: ${JSON.stringify(body)}`);
  }

  return body;
}

function field(body: unknown, ...path: readonly string[]): string {
  let current: unknown = body;

  for (const key of path) {
    current = typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[key] : undefined;
  }

  if (typeof current !== 'string') {
    throw new Error(`expected a string at ${path.join('.')}`);
  }

  return current;
}

/**
 * Half two: the demo user connects the bank the way a person would, every step
 * an HTTP request to a copy of this API listening on a spare port.
 */
async function connectAsAPerson(baseUrl: string): Promise<string> {
  const signedIn = await call(baseUrl, '/api/v1/identity/sessions', {
    method: 'POST',
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  const token = field(signedIn, 'session', 'token');

  const requested = await call(baseUrl, '/api/v1/consents', { method: 'POST', token });
  const consentId = field(requested, 'consent', 'id');
  const query = new URL(field(requested, 'authorisationUrl')).searchParams;

  const screen = await call(baseUrl, `/sandbox/open-finance/v2/authorize?${query.toString()}`, { method: 'GET', token });
  const accountIds = ((screen as { accounts: { id: string }[] }).accounts).map((account) => account.id);

  const decided = await call(baseUrl, '/sandbox/open-finance/v2/authorize', {
    method: 'POST',
    token,
    body: JSON.stringify({
      clientId: query.get('client_id'),
      redirectUri: query.get('redirect_uri'),
      scope: query.get('scope'),
      state: query.get('state'),
      codeChallenge: query.get('code_challenge'),
      codeChallengeMethod: query.get('code_challenge_method'),
      decision: 'APPROVE',
      accountIds,
    }),
  });
  const redirect = new URL(field(decided, 'redirectTo'));

  const completed = await call(baseUrl, `/api/v1/consents/${consentId}/authorisation`, {
    method: 'POST',
    token,
    body: JSON.stringify({ code: redirect.searchParams.get('code'), state: redirect.searchParams.get('state') }),
  });

  return String((completed as { ingestedCount: number }).ingestedCount);
}

/** A copy of the API on a spare port, with `open-finance` pointed at its own sandbox. */
async function withRunningApi<TResult>(work: (baseUrl: string) => Promise<TResult>): Promise<TResult> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  server.on(
    'request',
    createApp(
      buildContainer({
        prisma,
        logger,
        frontendOrigin: env.FRONTEND_ORIGIN,
        trustProxy: 'loopback',
        settings: {
          consentPolicyVersion: env.REGISTRATION_CONSENT_POLICY_VERSION,
          timeZone: env.TIME_ZONE,
          sessionLifetimeInDays: env.SESSION_TTL_IN_DAYS,
          sessionRenewWithinDays: env.SESSION_RENEW_WITHIN_DAYS,
          registrationAttemptsPerHour: env.REGISTRATION_ATTEMPTS_PER_HOUR,
          registrationSuccessesPerHour: env.REGISTRATION_SUCCESSES_PER_HOUR,
          signInAttemptsPerQuarterHour: env.SIGN_IN_ATTEMPTS_PER_QUARTER_HOUR,
          passwordResetAttemptsPerHour: env.PASSWORD_RESET_ATTEMPTS_PER_HOUR,
          classificationOverridesPerHour: env.CLASSIFICATION_OVERRIDES_PER_HOUR,
          consentCommandsPerHour: env.CONSENT_COMMANDS_PER_HOUR,
          sandboxLedgerEntriesPerHour: env.SANDBOX_BANK_LEDGER_ENTRIES_PER_HOUR,
          demoNotificationsPerHour: env.DEMO_NOTIFICATIONS_PER_HOUR,
        },
        openFinance: {
          tokenEncryptionKey: env.OPEN_FINANCE_TOKEN_KEY,
          dataHolder: {
            baseUrl: `${baseUrl}/sandbox/open-finance/v2`,
            authorisationScreenUrl: env.SANDBOX_BANK_AUTHORISATION_URL,
            clientId: env.OPEN_FINANCE_CLIENT_ID,
            clientSecret: env.OPEN_FINANCE_CLIENT_SECRET,
            redirectUri: env.OPEN_FINANCE_REDIRECT_URI,
          },
        },
        sandboxBank: {
          client: platformClient(`${baseUrl}/api/v1/data-holder-notices`),
          clientSecret: env.OPEN_FINANCE_CLIENT_SECRET,
          ledgerWritesEnabled: sandboxLedgerWritesEnabled(env),
        },
      }),
    ),
  );

  try {
    return await work(baseUrl);
  } finally {
    server.close();
  }
}

/** The platform as the sandbox enrols it: the same id, redirect and secret it presents. */
function platformClient(noticeUri: string): {
  readonly clientId: string;
  readonly displayName: string;
  readonly redirectUri: string;
  readonly noticeUri: string;
} {
  return {
    clientId: env.OPEN_FINANCE_CLIENT_ID,
    displayName: 'anti-aposta',
    redirectUri: env.OPEN_FINANCE_REDIRECT_URI,
    noticeUri,
  };
}

async function seed(): Promise<void> {
  await ensureBookmakers();

  const userId = await ensureDemoUser();
  // Registration creates the inbox through `UserRegistered`; the demo user is
  // written directly, so it gets one here. Idempotent, like the subscriber.
  await new CreateInbox(new PrismaInboxRepository(prisma), idGenerator, clock).execute({ userId });
  await resetDemoData(userId);

  const booked = await bookAtTheBank(userId);
  process.stdout.write(`booked ${String(booked)} synthetic movements at the sandbox bank\n`);

  if (WITHOUT_CONSENT) {
    process.stdout.write('left unconnected: sign in and connect the bank from the accounts screen\n');
  } else {
    const ingested = await withRunningApi(connectAsAPerson);
    process.stdout.write(`connected through the consent flow; ${ingested} transactions ingested\n`);
  }

  process.stdout.write(`sign in with: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

await seed();
await prisma.$disconnect();
