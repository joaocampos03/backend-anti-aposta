import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { ConsentRevoked } from '../domain/events/consent-revoked.js';
import {
  FakeDataHolder,
  InMemoryAuthorisationRequestRepository,
  InMemoryAuthorisationSecrets,
  InMemoryConnectedAccountRepository,
  InMemoryConsentRepository,
  InMemoryConsentTokenVault,
  InMemoryTransactionRepository,
  RecordingTransactionClassifier,
} from '../infrastructure/in-memory/in-memory-open-finance.js';
import { CompleteAuthorisation } from './complete-authorisation.use-case.js';
import { ConsentAccessTokens } from './consent-access-tokens.js';
import type { SharedTransaction } from './ports/data-holder.port.js';
import { RequestConsent } from './request-consent.use-case.js';
import { RevokeConsent } from './revoke-consent.use-case.js';
import { StatementSynchronisation } from './statement-synchronisation.js';
import { SynchroniseConsent } from './synchronise-consent.use-case.js';
import { SynchroniseNotifiedConsent } from './synchronise-notified-consent.use-case.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-0000000000aa';
const OTHER_USER_ID = '0192f3c1-7a1b-7c3e-9f20-0000000000bb';
const NOW = new Date('2026-10-12T15:00:00.000Z');

let clock: FixedClock;
let consents: InMemoryConsentRepository;
let requests: InMemoryAuthorisationRequestRepository;
let accounts: InMemoryConnectedAccountRepository;
let transactions: InMemoryTransactionRepository;
let vault: InMemoryConsentTokenVault;
let secrets: InMemoryAuthorisationSecrets;
let classifier: RecordingTransactionClassifier;
let dataHolder: FakeDataHolder;
let events: RecordingEventPublisher;
let requestConsent: RequestConsent;
let complete: CompleteAuthorisation;
let synchronise: SynchroniseConsent;
let synchroniseNotified: SynchroniseNotifiedConsent;

function anEntry(externalId: string, overrides: Partial<SharedTransaction> = {}): SharedTransaction {
  return {
    externalId,
    occurredAt: NOW,
    amountInCents: -5000,
    statementLine: 'PIX ENVIADO Aposta Andorinha',
    method: 'PIX',
    status: 'SETTLED',
    merchantCategoryCode: null,
    counterpartyDocument: '11222333000181',
    ...overrides,
  };
}

beforeEach(() => {
  clock = new FixedClock(NOW);
  consents = new InMemoryConsentRepository();
  requests = new InMemoryAuthorisationRequestRepository();
  accounts = new InMemoryConnectedAccountRepository();
  transactions = new InMemoryTransactionRepository();
  vault = new InMemoryConsentTokenVault();
  secrets = new InMemoryAuthorisationSecrets();
  classifier = new RecordingTransactionClassifier();
  dataHolder = new FakeDataHolder(() => clock.now());
  events = new RecordingEventPublisher();

  dataHolder.accounts = [
    {
      externalId: 'bank-checking',
      institution: 'Banco Andorinha',
      shortName: 'Andorinha',
      product: 'Conta corrente',
      fullNumber: '000447103',
      kind: 'CHECKING',
    },
  ];
  dataHolder.statements.set('bank-checking', [anEntry('entry-1')]);

  const idGenerator = new SequentialIdGenerator();
  const synchronisation = new StatementSynchronisation({
    dataHolder,
    consents,
    accounts,
    transactions,
    classifier,
    idGenerator,
    events,
  });

  requestConsent = new RequestConsent({
    consents,
    authorisationRequests: requests,
    dataHolder,
    secrets,
    idGenerator,
    clock,
  });
  complete = new CompleteAuthorisation({
    consents,
    authorisationRequests: requests,
    dataHolder,
    secrets,
    vault,
    synchronisation,
    clock,
    events,
  });
  synchronise = new SynchroniseConsent(
    consents,
    new ConsentAccessTokens(vault, dataHolder),
    synchronisation,
    clock,
  );
  synchroniseNotified = new SynchroniseNotifiedConsent(
    consents,
    new ConsentAccessTokens(vault, dataHolder),
    synchronisation,
    clock,
  );
});

/** The DataHolder's own id for the consent, which is all its notice names. */
function externalIdOf(consentId: string): string {
  return consents.consents.find((consent) => consent.id.value === consentId)?.externalConsentId ?? '';
}

/** Starts the flow and returns what the browser would carry back. */
async function start(userId = USER_ID): Promise<{ consentId: string; state: string }> {
  const requested = await requestConsent.execute({ userId });

  if (!requested.ok) {
    throw new Error('the consent request must be accepted');
  }

  const state = new URL(requested.value.authorisationUrl).searchParams.get('state') ?? '';

  return { consentId: requested.value.consent.id, state };
}

async function connect(): Promise<string> {
  const { consentId, state } = await start();
  await complete.execute({ userId: USER_ID, consentId, state, code: 'a-code' });

  return consentId;
}

describe('connecting an institution', () => {
  it('starts awaiting authorisation, with the PKCE challenge in the URL and nothing read', async () => {
    const requested = await requestConsent.execute({ userId: USER_ID });

    expect(requested.ok && requested.value.consent.status).toBe('AWAITING_AUTHORISATION');
    expect(requested.ok && requested.value.authorisationUrl).toContain('challenge=s256:verifier');
    expect(transactions.transactions).toHaveLength(0);
  });

  it('exchanges the code with the verifier, authorises, and ingests the first statement at once', async () => {
    const { consentId, state } = await start();

    const completed = await complete.execute({ userId: USER_ID, consentId, state, code: 'a-code' });

    expect(completed.ok && completed.value.consent.status).toBe('AUTHORISED');
    expect(completed.ok && completed.value.consent.syncStatus).toBe('READY');
    expect(completed.ok && completed.value.ingestedCount).toBe(1);
    expect(dataHolder.exchanged).toEqual([{ code: 'a-code', codeVerifier: 'verifier' }]);
  });

  it('masks the account number before anything is stored', async () => {
    await connect();

    expect(accounts.accounts[0]?.maskedNumber.value).toBe('•• 7103');
  });

  it('hands the statement line to bet-detection and keeps none of it', async () => {
    await connect();

    expect(classifier.classified[0]?.statementLine).toBe('PIX ENVIADO Aposta Andorinha');
  });

  it('records nothing when the state that comes back is not the one sent', async () => {
    const { consentId } = await start();

    const refused = await complete.execute({
      userId: USER_ID,
      consentId,
      state: 'forged',
      code: 'a-code',
    });

    expect(!refused.ok && refused.error.code).toBe('AUTHORISATION_STATE_MISMATCH');
    expect(dataHolder.exchanged).toHaveLength(0);
    expect(consents.consents[0]?.status).toBe('AWAITING_AUTHORISATION');
    expect(requests.requests).toHaveLength(1);
  });

  it('marks the consent rejected when the person said no at the institution', async () => {
    const { consentId, state } = await start();

    const completed = await complete.execute({ userId: USER_ID, consentId, state, code: null });

    expect(completed.ok && completed.value.consent.status).toBe('REJECTED');
    expect(dataHolder.exchanged).toHaveLength(0);
  });

  it('accepts a callback once: the second answers that nothing is pending', async () => {
    const { consentId, state } = await start();
    await complete.execute({ userId: USER_ID, consentId, state, code: 'a-code' });

    const again = await complete.execute({ userId: USER_ID, consentId, state, code: 'a-code' });

    expect(!again.ok && again.error.code).toBe('AUTHORISATION_NOT_PENDING');
  });

  it("answers another user's consent exactly as a missing one", async () => {
    const { consentId, state } = await start();

    const refused = await complete.execute({
      userId: OTHER_USER_ID,
      consentId,
      state,
      code: 'a-code',
    });

    expect(!refused.ok && refused.error.status).toBe(404);
  });

  it('refuses a second consent while one is authorised', async () => {
    await connect();

    const second = await requestConsent.execute({ userId: USER_ID });

    expect(!second.ok && second.error.code).toBe('CONSENT_ALREADY_AUTHORISED');
  });

  it('says the institution is unavailable, and records nothing, when it cannot be reached', async () => {
    dataHolder.failure = 'UNAVAILABLE';

    const refused = await requestConsent.execute({ userId: USER_ID });

    expect(!refused.ok && refused.error.status).toBe(502);
    expect(consents.consents).toHaveLength(0);
  });
});

describe('synchronising', () => {
  it('ingests nothing the second time when nothing changed at the institution', async () => {
    const consentId = await connect();

    const again = await synchronise.execute({ userId: USER_ID, consentId });

    expect(again.ok && again.value.ingestedCount).toBe(0);
    expect(transactions.transactions).toHaveLength(1);
  });

  it('picks up an entry booked at the institution since the last time', async () => {
    const consentId = await connect();
    dataHolder.statements.set('bank-checking', [anEntry('entry-1'), anEntry('entry-2')]);

    const again = await synchronise.execute({ userId: USER_ID, consentId });

    expect(again.ok && again.value.ingestedCount).toBe(1);
    expect(transactions.transactions.map((transaction) => transaction.externalId)).toEqual([
      'entry-1',
      'entry-2',
    ]);
  });

  it('refreshes an access token that has expired, and keeps the new pair', async () => {
    const consentId = await connect();
    clock.advanceByDays(1);

    await synchronise.execute({ userId: USER_ID, consentId });

    expect(dataHolder.refreshed).toHaveLength(1);
    expect((await vault.find(consentId))?.accessToken).not.toBe('access-2');
  });

  it('refuses a consent that is not authorised', async () => {
    const { consentId } = await start();

    const refused = await synchronise.execute({ userId: USER_ID, consentId });

    expect(!refused.ok && refused.error.code).toBe('CONSENT_NOT_AUTHORISED');
  });
});

describe('a notice from the institution', () => {
  it('reads what is new, as the button would, for the consent it names', async () => {
    const consentId = await connect();
    dataHolder.statements.set('bank-checking', [anEntry('entry-1'), anEntry('entry-2')]);

    const noticed = await synchroniseNotified.execute({
      externalConsentId: externalIdOf(consentId),
    });

    expect(noticed.ok && noticed.value.ingestedCount).toBe(1);
    expect(transactions.transactions.at(-1)?.userId.value).toBe(USER_ID);
  });

  it('announces the new movements to whoever owns the consent', async () => {
    const consentId = await connect();
    dataHolder.statements.set('bank-checking', [anEntry('entry-1'), anEntry('entry-2')]);
    events.published.length = 0;

    await synchroniseNotified.execute({ externalConsentId: externalIdOf(consentId) });

    expect(events.published.map((event) => event.payload)).toEqual([
      expect.objectContaining({ userId: USER_ID, transactionIds: [expect.any(String)] }),
    ]);
  });

  it('reads nothing for a consent the platform does not know', async () => {
    const noticed = await synchroniseNotified.execute({ externalConsentId: 'urn:fake-bank:999' });

    expect(!noticed.ok && noticed.error.code).toBe('CONSENT_NOT_FOUND');
    expect(dataHolder.exchanged).toHaveLength(0);
  });

  it('reads nothing for a consent that was revoked', async () => {
    const consentId = await connect();
    await new RevokeConsent(consents, dataHolder, clock, events).execute({
      userId: USER_ID,
      consentId,
    });
    dataHolder.statements.set('bank-checking', [anEntry('entry-1'), anEntry('entry-2')]);

    const noticed = await synchroniseNotified.execute({
      externalConsentId: externalIdOf(consentId),
    });

    expect(!noticed.ok && noticed.error.code).toBe('CONSENT_NOT_AUTHORISED');
  });
});

describe('revoking', () => {
  it('records ConsentRevoked even when the institution cannot be told', async () => {
    const consentId = await connect();
    dataHolder.revocationFailure = 'UNAVAILABLE';

    const revoked = await new RevokeConsent(consents, dataHolder, clock, events).execute({
      userId: USER_ID,
      consentId,
    });

    expect(revoked.ok).toBe(true);
    expect(events.published.some((event) => event instanceof ConsentRevoked)).toBe(true);
    expect(dataHolder.revoked).toHaveLength(1);
  });
});
