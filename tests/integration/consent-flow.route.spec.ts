import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { registerBookmaker, registerCaller } from './ledger-fixture.js';
import { createTestApp, startTestServer, type RunningTestServer } from './test-app.js';

/**
 * The whole Open Finance round trip, over real HTTP: the platform registers a
 * consent at the sandbox bank, the person authorises it on the bank's screen,
 * the callback is exchanged with PKCE, and the statement is pulled through the
 * anti-corruption layer. Every arrow in the browser's journey is a request
 * here, in the order the frontend makes them.
 */

let running: RunningTestServer;
let token: string;

beforeAll(async () => {
  running = await startTestServer();
});

afterAll(async () => {
  await running.close();
});

beforeEach(async () => {
  await registerBookmaker();
  token = (await registerCaller('ana@exemplo.com')).token;
});

function api(): request.Agent {
  return request.agent(running.server);
}

function asCaller(test: request.Test, bearer = token): request.Test {
  return test.set('Authorization', `Bearer ${bearer}`);
}

/** What the frontend's authorisation page receives in its query string. */
function screenQueryOf(authorisationUrl: string): Record<string, string> {
  return Object.fromEntries(new URL(authorisationUrl).searchParams.entries());
}

async function requestConsent(): Promise<{ consentId: string; query: Record<string, string> }> {
  const response = await asCaller(api().post('/api/v1/consents'));

  expect(response.status).toBe(201);

  return {
    consentId: response.body.consent.id as string,
    query: screenQueryOf(response.body.authorisationUrl as string),
  };
}

/** The bank's screen: read the request, then answer it. */
async function decide(
  query: Record<string, string>,
  decision: 'APPROVE' | 'REJECT',
  pick: (accounts: { id: string; type: string }[]) => string[] = (accounts) =>
    accounts.map((account) => account.id),
): Promise<URL> {
  const screen = await asCaller(api().get('/sandbox/open-finance/v2/authorize').query(query));

  expect(screen.status).toBe(200);

  const decided = await asCaller(api().post('/sandbox/open-finance/v2/authorize')).send({
    clientId: query['client_id'],
    redirectUri: query['redirect_uri'],
    scope: query['scope'],
    state: query['state'],
    codeChallenge: query['code_challenge'],
    codeChallengeMethod: query['code_challenge_method'],
    decision,
    accountIds: decision === 'APPROVE' ? pick(screen.body.accounts) : [],
  });

  expect(decided.status).toBe(200);

  return new URL(decided.body.redirectTo as string);
}

/** The frontend's callback route relaying what the bank sent back. */
function callback(consentId: string, redirect: URL): request.Test {
  const code = redirect.searchParams.get('code');
  const body =
    code === null
      ? { state: redirect.searchParams.get('state'), error: redirect.searchParams.get('error') }
      : { state: redirect.searchParams.get('state'), code };

  return asCaller(api().post(`/api/v1/consents/${consentId}/authorisation`)).send(body);
}

async function connect(): Promise<string> {
  const { consentId, query } = await requestConsent();
  const redirect = await decide(query, 'APPROVE');
  const completed = await callback(consentId, redirect);

  expect(completed.status).toBe(200);

  return consentId;
}

async function bankAccounts(): Promise<{ id: string; type: string }[]> {
  const response = await asCaller(api().get('/sandbox/bank/accounts'));

  return response.body.items as { id: string; type: string }[];
}

function bookEntry(accountId: string, entry: Record<string, unknown>): request.Test {
  return asCaller(api().post(`/sandbox/bank/accounts/${accountId}/ledger-entries`)).send(entry);
}

describe('connecting through the sandbox bank', () => {
  it('starts with no consent at all', async () => {
    const response = await asCaller(api().get('/api/v1/consents/current'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ consent: null });
  });

  it('sends the browser to the bank with a PKCE challenge, a state and the consent in the scope', async () => {
    const { query } = await requestConsent();

    expect(query).toMatchObject({
      response_type: 'code',
      client_id: 'anti-aposta',
      code_challenge_method: 'S256',
    });
    expect(query['code_challenge']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(query['scope']).toMatch(/^openid accounts consent:urn:sandbox-bank:/);
  });

  it('shows the person who is asking, for what, and which of their accounts they could share', async () => {
    const { query } = await requestConsent();

    const screen = await asCaller(api().get('/sandbox/open-finance/v2/authorize').query(query));

    expect(screen.body.client).toEqual({ displayName: 'anti-aposta' });
    expect(screen.body.consent.permissions).toContain('ACCOUNTS_TRANSACTIONS_READ');
    const accounts = screen.body.accounts as { type: string; numberEnding: string }[];
    expect(accounts.map((account) => account.type)).toEqual([
      'CONTA_DEPOSITO_A_VISTA',
      'CARTAO_CREDITO',
    ]);
    expect(accounts[0]?.numberEnding).toMatch(/^\d{4}$/);
  });

  it('authorises, connects exactly the accounts picked, and is READY with their statement', async () => {
    const { consentId, query } = await requestConsent();
    const redirect = await decide(query, 'APPROVE', (accounts) => [accounts[0]?.id ?? '']);

    const completed = await callback(consentId, redirect);

    expect(completed.body.consent).toMatchObject({ status: 'AUTHORISED', syncStatus: 'READY' });
    const accounts = await asCaller(api().get('/api/v1/accounts'));
    expect(accounts.body.items).toHaveLength(1);
    expect(accounts.body.items[0]).toMatchObject({
      institution: 'Banco Andorinha',
      shortName: 'Andorinha',
      product: 'Conta corrente',
      kind: 'CHECKING',
    });
    expect(accounts.body.items[0].maskedNumber).toMatch(/^•• \d{4}$/);
  });

  it('stores the bank tokens encrypted, never in clear', async () => {
    await connect();

    const [stored] = await prisma.consentToken.findMany();

    expect(stored?.accessTokenCiphertext).toMatch(/^v1\./);
    expect(stored?.refreshTokenCiphertext).toMatch(/^v1\./);
  });

  it('records the person saying no as REJECTED, and reads nothing', async () => {
    const { consentId, query } = await requestConsent();
    const redirect = await decide(query, 'REJECT');

    const completed = await callback(consentId, redirect);

    expect(redirect.searchParams.get('error')).toBe('access_denied');
    expect(completed.body.consent.status).toBe('REJECTED');
    expect(await prisma.connectedAccount.count()).toBe(0);
  });

  it('records nothing when the state that comes back is not the one sent', async () => {
    const { consentId, query } = await requestConsent();
    const redirect = await decide(query, 'APPROVE');
    redirect.searchParams.set('state', 'forged');

    const refused = await callback(consentId, redirect);

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('AUTHORISATION_STATE_MISMATCH');
    expect(await prisma.consentToken.count()).toBe(0);
  });

  it("answers 404 for somebody else's consent", async () => {
    const { consentId, query } = await requestConsent();
    const redirect = await decide(query, 'APPROVE');
    const stranger = await registerCaller('bruno@exemplo.com');

    const refused = await callback(consentId, redirect).set(
      'Authorization',
      `Bearer ${stranger.token}`,
    );

    expect(refused.status).toBe(404);
  });

  it('refuses a callback that carries neither a code nor an error, as 422', async () => {
    const { consentId } = await requestConsent();

    const refused = await asCaller(api().post(`/api/v1/consents/${consentId}/authorisation`)).send({
      state: 'only-a-state',
    });

    expect(refused.status).toBe(422);
  });

  it('refuses a second connection while one is authorised', async () => {
    await connect();

    const second = await asCaller(api().post('/api/v1/consents'));

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONSENT_ALREADY_AUTHORISED');
  });

  it('says the institution is unavailable, with 502, when it cannot be reached', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/consents')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('DATA_HOLDER_UNAVAILABLE');
  });
});

describe('a movement booked at the bank', () => {
  it('reaches the statement on the next synchronisation, classified as a bet', async () => {
    const consentId = await connect();
    const [checking] = await bankAccounts();

    const booked = await bookEntry(checking?.id ?? '', {
      amountInCents: -5000,
      transactionName: 'PIX ENVIADO Aposta Andorinha',
      type: 'PIX',
      payeeDocument: '11222333000181',
    });
    expect(booked.status).toBe(201);
    expect(booked.body.entry.amount).toEqual({ amountInCents: -5000, currency: 'BRL' });

    const synchronised = await asCaller(
      api().post(`/api/v1/consents/${consentId}/synchronisation`),
    );
    expect(synchronised.status).toBe(200);
    expect(synchronised.body.ingestedCount).toBe(1);

    const bets = await asCaller(api().get('/api/v1/transactions?type=BETS'));
    expect(bets.body.items).toHaveLength(1);
    expect(bets.body.items[0].amount).toEqual({ amountInCents: -5000, currency: 'BRL' });
    expect(bets.body.items[0].bet).toMatchObject({ matchedBy: 'LICENSED_CNPJ' });
  });

  it('is ingested once, however many times the person synchronises', async () => {
    const consentId = await connect();
    const [checking] = await bankAccounts();
    await bookEntry(checking?.id ?? '', {
      amountInCents: -2590,
      transactionName: 'SUPERMERCADO',
      type: 'CARTAO',
      merchantCategoryCode: 5411,
    });
    await asCaller(api().post(`/api/v1/consents/${consentId}/synchronisation`));

    const again = await asCaller(api().post(`/api/v1/consents/${consentId}/synchronisation`));

    expect(again.body.ingestedCount).toBe(0);
    expect(await prisma.transaction.count()).toBe(1);
  });

  it('files a card payment by its MCC, as a debit-card payment on a checking account', async () => {
    const consentId = await connect();
    const [checking] = await bankAccounts();
    await bookEntry(checking?.id ?? '', {
      amountInCents: -2590,
      transactionName: 'SUPERMERCADO PAO DE ACUCAR',
      type: 'CARTAO',
      merchantCategoryCode: 5411,
    });

    await asCaller(api().post(`/api/v1/consents/${consentId}/synchronisation`));

    const [row] = await prisma.transaction.findMany();
    expect(row).toMatchObject({ category: 'GROCERIES', method: 'DEBIT_CARD', betMatchedBy: null });
  });

  it('cannot be booked on an account that belongs to somebody else', async () => {
    const [theirs] = await bankAccounts();
    const stranger = await registerCaller('bruno@exemplo.com');

    const refused = await bookEntry(theirs?.id ?? '', {
      amountInCents: -5000,
      transactionName: 'PIX ENVIADO',
      type: 'PIX',
    }).set('Authorization', `Bearer ${stranger.token}`);

    expect(refused.status).toBe(404);
  });

  it('refuses a movement of nothing, as 422', async () => {
    const [checking] = await bankAccounts();

    const refused = await bookEntry(checking?.id ?? '', {
      amountInCents: 0,
      transactionName: 'PIX ENVIADO',
      type: 'PIX',
    });

    expect(refused.status).toBe(422);
  });

  it('refuses a PIX on a credit card, which is not how money moves on one', async () => {
    const [, card] = await bankAccounts();

    const refused = await bookEntry(card?.id ?? '', {
      amountInCents: -5000,
      transactionName: 'PIX ENVIADO',
      type: 'PIX',
    });

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('INVALID_LEDGER_ENTRY');
  });

  it('cannot be booked at all where ledger writes are switched off', async () => {
    const [checking] = await bankAccounts();

    const refused = await request(createTestApp({}, { ledgerWritesEnabled: false }))
      .post(`/sandbox/bank/accounts/${checking?.id ?? ''}/ledger-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountInCents: -5000, transactionName: 'PIX ENVIADO', type: 'PIX' });

    expect(refused.status).toBe(404);
  });
});

describe('revoking', () => {
  it('deletes the derived data here and kills the tokens at the bank', async () => {
    const consentId = await connect();
    const [checking] = await bankAccounts();
    await bookEntry(checking?.id ?? '', {
      amountInCents: -5000,
      transactionName: 'PIX ENVIADO',
      type: 'PIX',
    });
    await asCaller(api().post(`/api/v1/consents/${consentId}/synchronisation`));

    const revoked = await asCaller(api().post(`/api/v1/consents/${consentId}/revocation`));

    expect(revoked.status).toBe(204);
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.connectedAccount.count()).toBe(0);
    expect(await prisma.consentToken.count()).toBe(0);
    expect(await prisma.transactionClassification.count()).toBe(0);
    expect(await prisma.sandboxIssuedToken.count({ where: { revokedAt: null, consentId: { not: null } } })).toBe(0);
    const current = await asCaller(api().get('/api/v1/consents/current'));
    expect(current.body.consent).toMatchObject({ status: 'REVOKED', syncStatus: 'NO_CONSENT' });
  });

  it('leaves the bank its own ledger: revocation withdraws access, not history', async () => {
    const consentId = await connect();
    const [checking] = await bankAccounts();
    await bookEntry(checking?.id ?? '', {
      amountInCents: -5000,
      transactionName: 'PIX ENVIADO',
      type: 'PIX',
    });

    await asCaller(api().post(`/api/v1/consents/${consentId}/revocation`));

    expect(await prisma.sandboxLedgerEntry.count()).toBe(1);
  });

  it('refuses to synchronise a revoked consent', async () => {
    const consentId = await connect();
    await asCaller(api().post(`/api/v1/consents/${consentId}/revocation`));

    const refused = await asCaller(api().post(`/api/v1/consents/${consentId}/synchronisation`));

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('CONSENT_NOT_AUTHORISED');
  });

  it("answers 404 for somebody else's consent", async () => {
    const consentId = await connect();
    const stranger = await registerCaller('bruno@exemplo.com');

    const refused = await asCaller(
      api().post(`/api/v1/consents/${consentId}/revocation`),
      stranger.token,
    );

    expect(refused.status).toBe(404);
    expect(await prisma.consent.count({ where: { status: 'AUTHORISED' } })).toBe(1);
  });
});
