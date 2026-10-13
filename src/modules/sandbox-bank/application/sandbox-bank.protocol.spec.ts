import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import {
  InMemoryAuthorisationCodeRepository,
  InMemoryBankAccountRepository,
  InMemoryBankSecrets,
  InMemoryClientRegistry,
  InMemoryConsentRepository,
  InMemoryIssuedTokenRepository,
  InMemoryLedgerEntryRepository,
} from '../infrastructure/in-memory/in-memory-sandbox-bank.js';
import { CUSTOMER_ID, NOW, OTHER_CUSTOMER_ID } from '../testing/sandbox-bank.builders.js';
import { AccessTokenIntrospection } from './access-token-introspection.js';
import { AuthorisationRequestCheck } from './authorisation-request-check.js';
import { CreateConsent } from './create-consent.use-case.js';
import { DecideAuthorisation } from './decide-authorisation.use-case.js';
import { DemoAccountOpening } from './demo-account-opening.js';
import { DescribeAuthorisationRequest } from './describe-authorisation-request.use-case.js';
import { IssueToken } from './issue-token.use-case.js';
import { ListSharedAccounts } from './list-shared-accounts.use-case.js';
import { ListSharedTransactions } from './list-shared-transactions.use-case.js';
import { RecordLedgerEntry } from './record-ledger-entry.use-case.js';
import { RevokeConsent } from './revoke-consent.use-case.js';
import { TokenIssuance } from './token-issuance.js';

const CLIENT = {
  clientId: 'anti-aposta',
  displayName: 'anti-aposta',
  redirectUri: 'http://localhost:3000/api/open-finance/callback',
};
const SECRET = 'client-secret';
const VERIFIER = 'a-verifier-only-the-client-holds';
const STATE = 'state-the-client-will-check';
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

let clock: FixedClock;
let secrets: InMemoryBankSecrets;
let accounts: InMemoryBankAccountRepository;
let ledger: InMemoryLedgerEntryRepository;
let consents: InMemoryConsentRepository;
let codes: InMemoryAuthorisationCodeRepository;
let tokens: InMemoryIssuedTokenRepository;
let issueToken: IssueToken;
let describeRequest: DescribeAuthorisationRequest;
let decide: DecideAuthorisation;
let introspection: AccessTokenIntrospection;

beforeEach(() => {
  clock = new FixedClock(NOW);
  secrets = new InMemoryBankSecrets();
  accounts = new InMemoryBankAccountRepository();
  ledger = new InMemoryLedgerEntryRepository();
  consents = new InMemoryConsentRepository();
  codes = new InMemoryAuthorisationCodeRepository();
  tokens = new InMemoryIssuedTokenRepository();

  const idGenerator = new SequentialIdGenerator();
  const clients = new InMemoryClientRegistry(CLIENT, SECRET);
  const requests = new AuthorisationRequestCheck(clients, consents);
  const demoAccounts = new DemoAccountOpening(accounts, secrets, idGenerator);

  issueToken = new IssueToken({
    clients,
    consents,
    codes,
    tokens,
    issuance: new TokenIssuance(tokens, secrets, idGenerator),
    secrets,
    clock,
  });
  describeRequest = new DescribeAuthorisationRequest(requests, demoAccounts, clock);
  decide = new DecideAuthorisation({
    requests,
    consents,
    accounts,
    codes,
    secrets,
    idGenerator,
    clock,
  });
  introspection = new AccessTokenIntrospection(tokens, secrets, clock);
});

async function createConsent(): Promise<string> {
  const created = await new CreateConsent(consents, new SequentialIdGenerator(), clock).execute({
    clientId: CLIENT.clientId,
    permissions: ['ACCOUNTS_READ', 'ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ'],
    expiresAt: new Date(NOW.getTime() + 180 * MILLISECONDS_IN_A_DAY),
  });

  if (!created.ok) {
    throw new Error('the consent request must be accepted');
  }

  return created.value.consentId;
}

function requestFor(consentId: string, customerId = CUSTOMER_ID.value) {
  return { customerId, clientId: CLIENT.clientId, redirectUri: CLIENT.redirectUri, consentId };
}

/** Walks the customer through the screen and returns the code it hands back. */
async function approve(consentId: string): Promise<{ code: string; accountIds: string[] }> {
  const described = await describeRequest.execute(requestFor(consentId));
  const accountIds = described.ok ? described.value.accounts.map((account) => account.id) : [];

  const decided = await decide.execute({
    ...requestFor(consentId),
    state: STATE,
    codeChallenge: secrets.challengeOf(VERIFIER),
    decision: 'APPROVE',
    accountIds,
  });
  const redirect = new URL(decided.ok ? decided.value.redirectTo : 'http://invalid');

  return { code: redirect.searchParams.get('code') ?? '', accountIds };
}

function exchange(code: string, verifier = VERIFIER) {
  return issueToken.execute({
    clientId: CLIENT.clientId,
    clientSecret: SECRET,
    grantType: 'authorization_code',
    code,
    redirectUri: CLIENT.redirectUri,
    codeVerifier: verifier,
    refreshToken: null,
  });
}

function refresh(refreshToken: string) {
  return issueToken.execute({
    clientId: CLIENT.clientId,
    clientSecret: SECRET,
    grantType: 'refresh_token',
    code: null,
    redirectUri: null,
    codeVerifier: null,
    refreshToken,
  });
}

describe('the sandbox bank, end to end through its use cases', () => {
  describe('the token endpoint', () => {
    it('refuses a client whose secret is wrong', async () => {
      const refused = await issueToken.execute({
        clientId: CLIENT.clientId,
        clientSecret: 'guess',
        grantType: 'client_credentials',
        code: null,
        redirectUri: null,
        codeVerifier: null,
        refreshToken: null,
      });

      expect(!refused.ok && refused.error.status).toBe(401);
    });

    it('issues a consents-scope token for client credentials, and nothing else', async () => {
      const issued = await issueToken.execute({
        clientId: CLIENT.clientId,
        clientSecret: SECRET,
        grantType: 'client_credentials',
        code: null,
        redirectUri: null,
        codeVerifier: null,
        refreshToken: null,
      });
      const token = issued.ok ? issued.value.accessToken : '';

      expect(await introspection.holderOf(token, 'CONSENTS')).not.toBeNull();
      expect(await introspection.holderOf(token, 'ACCOUNTS')).toBeNull();
    });
  });

  describe('the authorisation screen', () => {
    it('opens a checking account and a card for a customer the bank has never seen', async () => {
      const described = await describeRequest.execute(requestFor(await createConsent()));

      expect(described.ok && described.value.accounts.map((account) => account.type)).toEqual([
        'CONTA_DEPOSITO_A_VISTA',
        'CARTAO_CREDITO',
      ]);
    });

    it('refuses a redirect the client never registered, without redirecting', async () => {
      const described = await describeRequest.execute({
        ...requestFor(await createConsent()),
        redirectUri: 'https://attacker.example/callback',
      });

      expect(!described.ok && described.error.code).toBe('INVALID_AUTHORISATION_REQUEST');
    });

    it('sends the browser back with access_denied and the same state when the customer says no', async () => {
      const consentId = await createConsent();

      const decided = await decide.execute({
        ...requestFor(consentId),
        state: STATE,
        codeChallenge: secrets.challengeOf(VERIFIER),
        decision: 'REJECT',
        accountIds: [],
      });
      const redirect = new URL(decided.ok ? decided.value.redirectTo : 'http://invalid');

      expect(redirect.searchParams.get('error')).toBe('access_denied');
      expect(redirect.searchParams.get('state')).toBe(STATE);
      expect(consents.consents[0]?.status).toBe('REJECTED');
    });

    it('refuses to share an account the customer does not hold', async () => {
      const consentId = await createConsent();
      await describeRequest.execute(requestFor(consentId, OTHER_CUSTOMER_ID.value));
      const theirs = accounts.accounts[0]?.id.value ?? '';

      const decided = await decide.execute({
        ...requestFor(consentId),
        state: STATE,
        codeChallenge: secrets.challengeOf(VERIFIER),
        decision: 'APPROVE',
        accountIds: [theirs],
      });

      expect(!decided.ok && decided.error.status).toBe(404);
    });
  });

  describe('exchanging the code', () => {
    it('turns the code and the matching verifier into tokens bound to the consent', async () => {
      const consentId = await createConsent();
      const { code } = await approve(consentId);

      const issued = await exchange(code);

      expect(issued.ok && issued.value.consentId).toBe(consentId);
      expect(issued.ok && issued.value.refreshToken).not.toBeNull();
    });

    it('refuses a verifier that does not match the challenge, as invalid_grant', async () => {
      const { code } = await approve(await createConsent());

      const refused = await exchange(code, 'somebody-elses-verifier');

      expect(!refused.ok && refused.error.code).toBe('INVALID_GRANT');
    });

    it('refuses the same code twice', async () => {
      const { code } = await approve(await createConsent());
      await exchange(code);

      const second = await exchange(code);

      expect(!second.ok && second.error.code).toBe('INVALID_GRANT');
    });
  });

  describe('refreshing', () => {
    it('rotates: the old refresh token stops working once used', async () => {
      const { code } = await approve(await createConsent());
      const issued = await exchange(code);
      const first = issued.ok ? (issued.value.refreshToken ?? '') : '';

      expect((await refresh(first)).ok).toBe(true);
      expect((await refresh(first)).ok).toBe(false);
    });

    it('revokes every token of the consent when a spent refresh token is replayed', async () => {
      const { code } = await approve(await createConsent());
      const issued = await exchange(code);
      const first = issued.ok ? (issued.value.refreshToken ?? '') : '';
      const rotated = await refresh(first);
      const current = rotated.ok ? rotated.value.accessToken : '';

      await refresh(first);

      expect(await introspection.holderOf(current, 'ACCOUNTS')).toBeNull();
    });
  });

  describe('reading what was shared', () => {
    it('lists only the accounts the customer picked', async () => {
      const consentId = await createConsent();
      const described = await describeRequest.execute(requestFor(consentId));
      const [checking] = described.ok ? described.value.accounts : [];
      await decide.execute({
        ...requestFor(consentId),
        state: STATE,
        codeChallenge: secrets.challengeOf(VERIFIER),
        decision: 'APPROVE',
        accountIds: [checking?.id ?? ''],
      });

      const listed = await new ListSharedAccounts(consents, accounts, clock).execute({ consentId });

      expect(listed.ok && listed.value.accounts.map((account) => account.accountId)).toEqual([
        checking?.id,
      ]);
    });

    it('serves an entry booked after the consent, the next time it is asked', async () => {
      const consentId = await createConsent();
      const { accountIds } = await approve(consentId);
      const checkingId = accountIds[0] ?? '';

      await new RecordLedgerEntry(accounts, ledger, new SequentialIdGenerator(), clock).execute({
        customerId: CUSTOMER_ID.value,
        accountId: checkingId,
        amountInCents: -5000,
        transactionName: 'PIX ENVIADO Aposta Andorinha',
        type: 'PIX',
        status: 'TRANSACAO_EFETIVADA',
        bookedAt: null,
        merchantCategoryCode: 7995,
        payeeDocument: null,
      });

      const page = await new ListSharedTransactions(consents, ledger, clock).execute({
        consentId,
        accountId: checkingId,
        fromBookingDate: null,
        toBookingDate: null,
        page: 1,
        pageSize: 25,
      });

      expect(page.ok && page.value.transactions.map((entry) => entry.amountInCents)).toEqual([
        -5000,
      ]);
    });

    it('stops serving anything once the consent is revoked, tokens included', async () => {
      const consentId = await createConsent();
      const { code } = await approve(consentId);
      const issued = await exchange(code);
      const access = issued.ok ? issued.value.accessToken : '';

      await new RevokeConsent(consents, tokens, clock).execute({
        clientId: CLIENT.clientId,
        consentId,
      });

      expect(await introspection.holderOf(access, 'ACCOUNTS')).toBeNull();
      const listed = await new ListSharedAccounts(consents, accounts, clock).execute({ consentId });
      expect(!listed.ok && listed.error.code).toBe('CONSENT_NOT_ACTIVE');
    });
  });

  describe('booking an entry', () => {
    it('answers 404 for an account that belongs to somebody else', async () => {
      await describeRequest.execute(requestFor(await createConsent(), OTHER_CUSTOMER_ID.value));
      const theirs = accounts.accounts[0]?.id.value ?? '';

      const refused = await new RecordLedgerEntry(
        accounts,
        ledger,
        new SequentialIdGenerator(),
        clock,
      ).execute({
        customerId: CUSTOMER_ID.value,
        accountId: theirs,
        amountInCents: -5000,
        transactionName: 'PIX ENVIADO',
        type: 'PIX',
        status: 'TRANSACAO_EFETIVADA',
        bookedAt: null,
        merchantCategoryCode: null,
        payeeDocument: null,
      });

      expect(!refused.ok && refused.error.status).toBe(404);
      expect(ledger.entries).toHaveLength(0);
    });
  });
});
