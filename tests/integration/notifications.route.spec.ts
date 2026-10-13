import { get, type ClientRequest } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { registerBookmaker, registerCaller } from './ledger-fixture.js';
import { createTestApp, startTestServer, type RunningTestServer } from './test-app.js';

/**
 * The stream and everything that feeds it, over real HTTP: the demonstration
 * console sending to one person by id, and a movement booked at the bank
 * reaching that person's open screen through the bank's notice, the
 * platform's synchronisation and `TransactionsIngested`.
 */

interface Frame {
  readonly id: string;
  readonly event: string;
  readonly data: Record<string, unknown>;
}

interface OpenStream {
  readonly status: number;
  readonly frames: Frame[];
  waitFor(count: number): Promise<readonly Frame[]>;
  close(): void;
}

const FRAME_WAIT_IN_MILLISECONDS = 5_000;
const POLL_IN_MILLISECONDS = 20;

let running: RunningTestServer;
let ana: { userId: string; token: string };
let bruno: { userId: string; token: string };
const openStreams: OpenStream[] = [];

beforeAll(async () => {
  running = await startTestServer();
});

afterAll(async () => {
  await running.close();
});

beforeEach(async () => {
  await registerBookmaker();
  ana = await registerCaller('ana@exemplo.com');
  bruno = await registerCaller('bruno@exemplo.com');
});

afterEach(() => {
  for (const stream of openStreams.splice(0)) {
    stream.close();
  }
});

function api(): request.Agent {
  return request.agent(running.server);
}

function asCaller(test: request.Test, bearer: string): request.Test {
  return test.set('Authorization', `Bearer ${bearer}`);
}

function parseFrame(raw: string): Frame | null {
  const fields = new Map<string, string>();

  for (const line of raw.split('\n')) {
    const separator = line.indexOf(': ');

    if (separator > 0) {
      fields.set(line.slice(0, separator), line.slice(separator + 2));
    }
  }

  const data = fields.get('data');

  return data === undefined
    ? null
    : { id: fields.get('id') ?? '', event: fields.get('event') ?? '', data: JSON.parse(data) };
}

/** An `EventSource`, by hand: what the browser does, minus the reconnecting. */
async function openStream(bearer: string, lastEventId?: string): Promise<OpenStream> {
  const frames: Frame[] = [];
  let buffered = '';
  let outgoing: ClientRequest | undefined;

  const status = await new Promise<number>((resolve) => {
    outgoing = get(
      `${running.baseUrl}/api/v1/notifications/stream`,
      {
        headers: {
          authorization: `Bearer ${bearer}`,
          accept: 'text/event-stream',
          ...(lastEventId === undefined ? {} : { 'last-event-id': lastEventId }),
        },
      },
      (response) => {
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          buffered += chunk;
          const complete = buffered.split('\n\n');
          buffered = complete.pop() ?? '';
          frames.push(...complete.map(parseFrame).filter((frame) => frame !== null));
        });
        resolve(response.statusCode ?? 0);
      },
    );
    outgoing.on('error', () => resolve(0));
  });

  const stream: OpenStream = {
    status,
    frames,
    waitFor: async (count) => {
      const deadline = Date.now() + FRAME_WAIT_IN_MILLISECONDS;

      while (frames.length < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_IN_MILLISECONDS));
      }

      return frames;
    },
    close: () => outgoing?.destroy(),
  };
  openStreams.push(stream);

  return stream;
}

function sendDemo(recipientId: string, body: Record<string, unknown>, bearer = ana.token) {
  return asCaller(api().post(`/api/v1/users/${recipientId}/notifications`), bearer).send(body);
}

/** The consent flow, as the browser walks it, so the bank has somebody to notify. */
async function connect(caller: { token: string }): Promise<void> {
  const requested = await asCaller(api().post('/api/v1/consents'), caller.token);
  const query = Object.fromEntries(
    new URL(requested.body.authorisationUrl as string).searchParams.entries(),
  );
  const screen = await asCaller(
    api().get('/sandbox/open-finance/v2/authorize').query(query),
    caller.token,
  );
  const decided = await asCaller(api().post('/sandbox/open-finance/v2/authorize'), caller.token).send({
    clientId: query['client_id'],
    redirectUri: query['redirect_uri'],
    scope: query['scope'],
    state: query['state'],
    codeChallenge: query['code_challenge'],
    codeChallengeMethod: query['code_challenge_method'],
    decision: 'APPROVE',
    accountIds: (screen.body.accounts as { id: string }[]).map((account) => account.id),
  });
  const redirect = new URL(decided.body.redirectTo as string);
  const completed = await asCaller(
    api().post(`/api/v1/consents/${requested.body.consent.id as string}/authorisation`),
    caller.token,
  ).send({ state: redirect.searchParams.get('state'), code: redirect.searchParams.get('code') });

  expect(completed.status).toBe(200);
}

describe('GET /api/v1/notifications/stream', () => {
  it('refuses to open without a session', async () => {
    const stream = await openStream('not-a-session');

    expect(stream.status).toBe(401);
  });

  it('opens as an event stream for a signed-in person', async () => {
    const stream = await openStream(ana.token);

    expect(stream.status).toBe(200);
  });

  it('replays what came after Last-Event-ID, and nothing before it', async () => {
    const first = await sendDemo(ana.userId, { kind: 'STREAK_BROKEN', previousDays: 4 });
    await sendDemo(ana.userId, { kind: 'STREAK_BROKEN', previousDays: 9 });

    const stream = await openStream(ana.token, first.body.id as string);
    const frames = await stream.waitFor(1);

    expect(frames.map((frame) => frame.data['previousDays'])).toEqual([9]);
  });
});

describe('POST /api/v1/users/{userId}/notifications', () => {
  it('reaches the recipient’s open stream as a named event, and nobody else’s', async () => {
    const anaStream = await openStream(ana.token);
    const brunoStream = await openStream(bruno.token);

    const sent = await sendDemo(ana.userId, { kind: 'STREAK_BROKEN', previousDays: 11 }, bruno.token);
    const [frame] = await anaStream.waitFor(1);

    expect(sent.status).toBe(201);
    expect(frame).toMatchObject({
      id: sent.body.id,
      event: 'STREAK_BROKEN',
      data: { kind: 'STREAK_BROKEN', previousDays: 11 },
    });
    expect(brunoStream.frames).toHaveLength(0);
  });

  it('keeps it in the recipient’s inbox when no stream is open', async () => {
    const sent = await sendDemo(ana.userId, {
      kind: 'GOAL_REACHED',
      label: 'Curso técnico',
      amountInCents: 50_000,
    });

    expect(sent.status).toBe(201);
    expect(await prisma.notification.count({ where: { recipientId: ana.userId } })).toBe(1);
  });

  it('computes a nudge’s yield on the server, from the amount alone', async () => {
    const sent = await sendDemo(ana.userId, {
      kind: 'AWARENESS_NUDGE',
      merchant: 'Aposta Andorinha',
      amountInCents: -50_000,
      monthlyTotalInCents: 184_000,
      matchedBy: 'MCC 7995',
    });

    expect(sent.status).toBe(201);
    expect(sent.body.yieldInCents).toBeGreaterThan(50_000);
    expect(sent.body.annualRatePercent).toBe(11.4);
  });

  it('refuses a yield typed into the console', async () => {
    const sent = await sendDemo(ana.userId, {
      kind: 'AWARENESS_NUDGE',
      merchant: 'Aposta Andorinha',
      amountInCents: -50_000,
      yieldInCents: 1,
      monthlyTotalInCents: 184_000,
      matchedBy: 'MCC 7995',
    });

    expect(sent.status).toBe(422);
    expect(sent.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('answers 404 for an id nobody registered', async () => {
    const sent = await sendDemo('0192f3c1-7a1b-7c3e-9f20-0000000000cc', {
      kind: 'STREAK_BROKEN',
      previousDays: 3,
    });

    expect(sent.status).toBe(404);
    expect(sent.body.error.code).toBe('RECIPIENT_NOT_FOUND');
  });

  it('refuses a caller without a session', async () => {
    const sent = await sendDemo(ana.userId, { kind: 'STREAK_BROKEN', previousDays: 3 }, 'nope');

    expect(sent.status).toBe(401);
  });

  it('does not exist where demo writes are switched off', async () => {
    const response = await request(createTestApp({}, { ledgerWritesEnabled: false }))
      .post(`/api/v1/users/${ana.userId}/notifications`)
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ kind: 'STREAK_BROKEN', previousDays: 3 });

    expect(response.status).toBe(404);
  });
});

describe('a movement booked for somebody, reaching their open screen', () => {
  it('lists the customer’s accounts at the bank without opening any for an unknown id', async () => {
    const nobody = await asCaller(
      api().get('/sandbox/bank/customers/0192f3c1-7a1b-7c3e-9f20-0000000000cc/accounts'),
      ana.token,
    );

    expect(nobody.status).toBe(200);
    expect(nobody.body.items).toEqual([]);
    expect(await prisma.sandboxBankAccount.count()).toBe(0);
  });

  it('synchronises at once and tells the person how many movements arrived', async () => {
    await connect(ana);
    const anaStream = await openStream(ana.token);
    const accounts = await asCaller(
      api().get(`/sandbox/bank/customers/${ana.userId}/accounts`),
      bruno.token,
    );
    const checking = (accounts.body.items as { id: string; type: string }[]).find(
      (account) => account.type === 'CONTA_DEPOSITO_A_VISTA',
    );

    const booked = await asCaller(
      api().post(`/sandbox/bank/customers/${ana.userId}/accounts/${checking?.id ?? ''}/ledger-entries`),
      bruno.token,
    ).send({
      amountInCents: -5000,
      transactionName: 'PIX ENVIADO Aposta Andorinha',
      type: 'PIX',
      payeeDocument: '11222333000181',
    });
    const [frame] = await anaStream.waitFor(1);

    expect(booked.status).toBe(201);
    expect(frame).toMatchObject({
      event: 'TRANSACTIONS_INGESTED',
      data: { kind: 'TRANSACTIONS_INGESTED', ingestedCount: 1 },
    });
    expect(await prisma.transaction.count({ where: { userId: ana.userId } })).toBe(1);
  });

  it('answers 404 for an account that is not the named customer’s', async () => {
    await connect(ana);
    const bankAccounts = await asCaller(api().get('/sandbox/bank/accounts'), bruno.token);
    const brunosAccount = (bankAccounts.body.items as { id: string }[])[0]?.id ?? '';

    const booked = await asCaller(
      api().post(`/sandbox/bank/customers/${ana.userId}/accounts/${brunosAccount}/ledger-entries`),
      ana.token,
    ).send({ amountInCents: -5000, transactionName: 'PIX ENVIADO', type: 'PIX' });

    expect(booked.status).toBe(404);
  });
});

describe('POST /api/v1/data-holder-notices', () => {
  it('refuses anybody but the institution', async () => {
    const response = await api()
      .post('/api/v1/data-holder-notices')
      .set('Authorization', `Basic ${Buffer.from('anti-aposta:guess').toString('base64')}`)
      .send({ data: { consentId: 'urn:sandbox-bank:0192f3c1-7a1b-7c3e-9f20-0000000000cc' } });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a session in place of the institution’s credentials', async () => {
    const response = await asCaller(api().post('/api/v1/data-holder-notices'), ana.token).send({
      data: { consentId: 'urn:sandbox-bank:0192f3c1-7a1b-7c3e-9f20-0000000000cc' },
    });

    expect(response.status).toBe(401);
  });
});
