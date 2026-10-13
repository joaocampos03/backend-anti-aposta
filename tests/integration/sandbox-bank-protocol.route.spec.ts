import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerCaller } from './ledger-fixture.js';
import { createTestApp, TEST_CLIENT, TEST_OPEN_FINANCE } from './test-app.js';

/**
 * The sandbox's Open Finance surface as a DataRecipient's client library sees
 * it: OAuth's error shape on the token endpoint, the specification's
 * `data`/`links`/`meta` envelopes and field names on the resources.
 */

const BASE = '/sandbox/open-finance/v2';
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const app = createTestApp();

let customerToken: string;

beforeEach(async () => {
  customerToken = (await registerCaller('ana@exemplo.com')).token;
});

function basic(secret = TEST_OPEN_FINANCE.dataHolder.clientSecret): string {
  return `Basic ${Buffer.from(`${TEST_CLIENT.clientId}:${secret}`).toString('base64')}`;
}

function token(form: Record<string, string>, authorization = basic()): request.Test {
  return request(app)
    .post(`${BASE}/token`)
    .set('Authorization', authorization)
    .type('form')
    .send(form);
}

async function consentsToken(): Promise<string> {
  const response = await token({ grant_type: 'client_credentials' });

  return response.body.access_token as string;
}

function createConsent(bearer: string, days = 180): request.Test {
  return request(app)
    .post(`${BASE}/consents`)
    .set('Authorization', `Bearer ${bearer}`)
    .send({
      data: {
        permissions: ['ACCOUNTS_READ', 'ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ'],
        expirationDateTime: new Date(Date.now() + days * DAY_IN_MILLISECONDS).toISOString(),
      },
    });
}

/** Walks a consent to an accounts-scope token, sharing only the checking account. */
async function accountsToken(): Promise<{ access: string; checkingId: string; cardId: string }> {
  const consentId = (await createConsent(await consentsToken())).body.data.consentId as string;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const scope = `openid accounts consent:${consentId}`;

  const screen = await request(app)
    .get(`${BASE}/authorize`)
    .set('Authorization', `Bearer ${customerToken}`)
    .query({
      response_type: 'code',
      client_id: TEST_CLIENT.clientId,
      redirect_uri: TEST_CLIENT.redirectUri,
      scope,
      state: 'state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
  const [checking, card] = screen.body.accounts as { id: string }[];

  const decided = await request(app)
    .post(`${BASE}/authorize`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      clientId: TEST_CLIENT.clientId,
      redirectUri: TEST_CLIENT.redirectUri,
      scope,
      state: 'state',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      decision: 'APPROVE',
      accountIds: [checking?.id],
    });
  const code = new URL(decided.body.redirectTo as string).searchParams.get('code') ?? '';

  const issued = await token({
    grant_type: 'authorization_code',
    code,
    redirect_uri: TEST_CLIENT.redirectUri,
    code_verifier: verifier,
  });

  return {
    access: issued.body.access_token as string,
    checkingId: checking?.id ?? '',
    cardId: card?.id ?? '',
  };
}

describe('POST /sandbox/open-finance/v2/token', () => {
  it('issues a bearer token for client credentials, never cached', async () => {
    const response = await token({ grant_type: 'client_credentials' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      access_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: 900,
      scope: 'consents',
    });
  });

  it("answers OAuth's invalid_client, with a challenge, for a wrong secret", async () => {
    const response = await token({ grant_type: 'client_credentials' }, basic('not-the-secret'));

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
    expect(response.body).toEqual({
      error: 'invalid_client',
      error_description: expect.any(String),
    });
  });

  it('answers invalid_request for a grant it does not know', async () => {
    const response = await token({ grant_type: 'password' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
  });

  it('answers invalid_grant for a code it never issued', async () => {
    const response = await token({
      grant_type: 'authorization_code',
      code: 'never-issued',
      redirect_uri: TEST_CLIENT.redirectUri,
      code_verifier: randomBytes(32).toString('base64url'),
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_grant');
  });
});

describe('POST /sandbox/open-finance/v2/consents', () => {
  it('answers in the specification envelope, with a URN for the consent', async () => {
    const response = await createConsent(await consentsToken());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      consentId: expect.stringMatching(/^urn:sandbox-bank:[0-9a-f-]{36}$/),
      status: 'AWAITING_AUTHORISATION',
      permissions: ['ACCOUNTS_READ', 'ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ'],
    });
    expect(response.body.links.self).toContain(response.body.data.consentId);
    expect(response.body.meta).toMatchObject({ totalRecords: 1, totalPages: 1 });
  });

  it('refuses a consent longer than twelve months, in the specification error shape', async () => {
    const response = await createConsent(await consentsToken(), 400);

    expect(response.status).toBe(422);
    expect(response.body.errors[0]).toMatchObject({ code: 'INVALID_CONSENT_REQUEST' });
    expect(response.body.meta.requestDateTime).toEqual(expect.any(String));
  });

  it('refuses a request with no bearer token, as 401', async () => {
    const response = await request(app).post(`${BASE}/consents`).send({});

    expect(response.status).toBe(401);
    expect(response.body.errors[0].code).toBe('UNAUTHORIZED');
  });
});

describe('GET /sandbox/open-finance/v2/accounts', () => {
  it('lists only the accounts shared, number and check digit in full as the specification sends them', async () => {
    const { access, checkingId } = await accountsToken();

    const response = await request(app)
      .get(`${BASE}/accounts`)
      .set('Authorization', `Bearer ${access}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        brandName: 'Banco Andorinha',
        companyCnpj: '11444777000161',
        type: 'CONTA_DEPOSITO_A_VISTA',
        subtype: 'INDIVIDUAL',
        compeCode: '999',
        branchCode: '0001',
        number: expect.stringMatching(/^\d{8}$/),
        checkDigit: expect.stringMatching(/^\d$/),
        accountId: checkingId,
      },
    ]);
  });

  it('refuses a consents-scope token: it reads no account', async () => {
    const response = await request(app)
      .get(`${BASE}/accounts`)
      .set('Authorization', `Bearer ${await consentsToken()}`);

    expect(response.status).toBe(401);
  });
});

describe('GET /sandbox/open-finance/v2/accounts/{accountId}/transactions', () => {
  async function book(accountId: string, amountInCents: number, mcc: number | null): Promise<void> {
    await request(app)
      .post(`/sandbox/bank/accounts/${accountId}/ledger-entries`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        amountInCents,
        transactionName: 'Aposta Andorinha',
        type: mcc === null ? 'PIX' : 'CARTAO',
        merchantCategoryCode: mcc,
      })
      .expect(201);
  }

  it('sends amounts as decimal strings and the direction as creditDebitType', async () => {
    const { access, checkingId } = await accountsToken();
    await book(checkingId, -5005, 7995);

    const response = await request(app)
      .get(`${BASE}/accounts/${checkingId}/transactions`)
      .set('Authorization', `Bearer ${access}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      completedAuthorisedPaymentType: 'TRANSACAO_EFETIVADA',
      creditDebitType: 'DEBITO',
      transactionName: 'Aposta Andorinha',
      type: 'CARTAO',
      transactionAmount: { amount: '50.05', currency: 'BRL' },
      merchantCategoryCode: '7995',
    });
  });

  it('pages, and links to the next page while there is one', async () => {
    const { access, checkingId } = await accountsToken();
    await book(checkingId, -1000, null);
    await book(checkingId, 2000, null);

    const response = await request(app)
      .get(`${BASE}/accounts/${checkingId}/transactions?page-size=1`)
      .set('Authorization', `Bearer ${access}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ totalRecords: 2, totalPages: 2 });
    expect(response.body.links.next).toContain('page=2');
  });

  it('answers 404 for an account the consent does not share', async () => {
    const { access, cardId } = await accountsToken();

    const response = await request(app)
      .get(`${BASE}/accounts/${cardId}/transactions`)
      .set('Authorization', `Bearer ${access}`);

    expect(response.status).toBe(404);
    expect(response.body.errors[0].code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('refuses a page size beyond the specification maximum, as 422', async () => {
    const { access, checkingId } = await accountsToken();

    const response = await request(app)
      .get(`${BASE}/accounts/${checkingId}/transactions?page-size=5000`)
      .set('Authorization', `Bearer ${access}`);

    expect(response.status).toBe(422);
  });
});

describe('the bank screens', () => {
  it('require the person to be signed in', async () => {
    const response = await request(app).get('/sandbox/bank/accounts');

    expect(response.status).toBe(401);
  });

  it('refuse an authorisation request whose challenge method is not S256', async () => {
    const response = await request(app)
      .get(`${BASE}/authorize`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({
        response_type: 'code',
        client_id: TEST_CLIENT.clientId,
        redirect_uri: TEST_CLIENT.redirectUri,
        scope: 'openid accounts consent:urn:sandbox-bank:0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77',
        state: 'state',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'plain',
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});
