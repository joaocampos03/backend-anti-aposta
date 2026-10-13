import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { AuthorisationSecrets } from '../../application/ports/authorisation-secrets.port.js';
import type { ConsentTokenVault } from '../../application/ports/consent-token-vault.port.js';
import type {
  DataHolder,
  DataHolderFailure,
  DataHolderTokens,
  SharedAccount,
  SharedTransaction,
} from '../../application/ports/data-holder.port.js';
import type { TransactionClassifier } from '../../application/ports/transaction-classifier.port.js';
import type { AuthorisationRequest } from '../../domain/authorisation-request.js';
import type { AuthorisationRequestRepository } from '../../domain/authorisation-request.repository.js';
import type { Consent } from '../../domain/consent.js';
import type { ConsentRepository } from '../../domain/consent.repository.js';
import type { ConnectedAccount } from '../../domain/connected-account.js';
import type { ConnectedAccountRepository } from '../../domain/connected-account.repository.js';
import type { Transaction } from '../../domain/transaction.js';
import type { TransactionRepository } from '../../domain/transaction.repository.js';

function upsert<TItem extends { readonly id: UniqueEntityId }>(items: TItem[], item: TItem): void {
  const index = items.findIndex((stored) => stored.id.equals(item.id));

  if (index >= 0) {
    items.splice(index, 1, item);

    return;
  }

  items.push(item);
}

function removeWhere<TItem>(items: TItem[], matches: (item: TItem) => boolean): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item !== undefined && matches(item)) {
      items.splice(index, 1);
    }
  }
}

export class InMemoryConsentRepository implements ConsentRepository {
  readonly consents: Consent[] = [];

  async save(consent: Consent): Promise<void> {
    upsert(this.consents, consent);
  }

  async findByIdAndUserId(consentId: UniqueEntityId, userId: UniqueEntityId): Promise<Consent | null> {
    return (
      this.consents.find((consent) => consent.id.equals(consentId) && consent.userId.equals(userId)) ??
      null
    );
  }

  async findAuthorisedByUserId(userId: UniqueEntityId, moment: Date): Promise<Consent | null> {
    return (
      this.consents.find(
        (consent) => consent.userId.equals(userId) && consent.isAuthorisedAt(moment),
      ) ?? null
    );
  }

  async findLatestByUserId(userId: UniqueEntityId): Promise<Consent | null> {
    const theirs = this.consents.filter((consent) => consent.userId.equals(userId));

    return theirs.at(-1) ?? null;
  }
}

export class InMemoryAuthorisationRequestRepository implements AuthorisationRequestRepository {
  readonly requests: AuthorisationRequest[] = [];

  async save(request: AuthorisationRequest): Promise<void> {
    upsert(this.requests, request);
  }

  async findByConsentIdAndUserId(
    consentId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<AuthorisationRequest | null> {
    return (
      this.requests.find(
        (request) => request.consentId.equals(consentId) && request.userId.equals(userId),
      ) ?? null
    );
  }

  async delete(consentId: UniqueEntityId): Promise<void> {
    removeWhere(this.requests, (request) => request.consentId.equals(consentId));
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    removeWhere(this.requests, (request) => request.userId.equals(userId));
  }
}

export class InMemoryConnectedAccountRepository implements ConnectedAccountRepository {
  readonly accounts: ConnectedAccount[] = [];

  async save(account: ConnectedAccount): Promise<void> {
    upsert(this.accounts, account);
  }

  async findByConsentId(consentId: UniqueEntityId): Promise<readonly ConnectedAccount[]> {
    return this.accounts.filter((account) => account.consentId.equals(consentId));
  }

  async findByIdAndUserId(
    accountId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<ConnectedAccount | null> {
    return (
      this.accounts.find((account) => account.id.equals(accountId) && account.userId.equals(userId)) ??
      null
    );
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    removeWhere(this.accounts, (account) => account.userId.equals(userId));
  }
}

export class InMemoryTransactionRepository implements TransactionRepository {
  readonly transactions: Transaction[] = [];

  async save(transaction: Transaction): Promise<void> {
    upsert(this.transactions, transaction);
  }

  async findByIdAndUserId(
    transactionId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<Transaction | null> {
    return (
      this.transactions.find(
        (transaction) => transaction.id.equals(transactionId) && transaction.userId.equals(userId),
      ) ?? null
    );
  }

  async findIngestedExternalIds(
    accountId: UniqueEntityId,
    candidates: readonly string[],
  ): Promise<ReadonlySet<string>> {
    return new Set(
      this.transactions
        .filter((transaction) => transaction.accountId.equals(accountId))
        .map((transaction) => transaction.externalId)
        .filter((externalId) => candidates.includes(externalId)),
    );
  }

  async markOverride(): Promise<void> {
    // The override marker is a column, not part of the aggregate.
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    removeWhere(this.transactions, (transaction) => transaction.userId.equals(userId));
  }
}

export class InMemoryConsentTokenVault implements ConsentTokenVault {
  readonly stored = new Map<string, { readonly userId: string; readonly tokens: DataHolderTokens }>();

  async store(input: {
    readonly consentId: string;
    readonly userId: string;
    readonly tokens: DataHolderTokens;
  }): Promise<void> {
    this.stored.set(input.consentId, { userId: input.userId, tokens: input.tokens });
  }

  async find(consentId: string): Promise<DataHolderTokens | null> {
    return this.stored.get(consentId)?.tokens ?? null;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [consentId, entry] of this.stored) {
      if (entry.userId === userId) {
        this.stored.delete(consentId);
      }
    }
  }
}

/** Readable values, so a test can present back the state it was handed. */
export class InMemoryAuthorisationSecrets implements AuthorisationSecrets {
  private issued = 0;

  generateState(): string {
    this.issued += 1;

    return `state-${String(this.issued)}`;
  }

  generateCodeVerifier(): string {
    return 'verifier';
  }

  challengeOf(codeVerifier: string): string {
    return `s256:${codeVerifier}`;
  }

  fingerprint(value: string): string {
    return `fingerprint:${value}`;
  }
}

export class RecordingTransactionClassifier implements TransactionClassifier {
  readonly classified: { readonly transactionId: string; readonly statementLine: string }[] = [];

  async classify(input: {
    readonly transactionId: string;
    readonly statementLine: string;
  }): Promise<void> {
    this.classified.push({ transactionId: input.transactionId, statementLine: input.statementLine });
  }
}

/**
 * A scriptable institution. Tests set what it shares and how it fails; it
 * records what it was asked, so a test can assert the protocol was followed.
 */
export class FakeDataHolder implements DataHolder {
  accounts: SharedAccount[] = [];
  readonly statements = new Map<string, SharedTransaction[]>();
  failure: DataHolderFailure | null = null;
  revocationFailure: DataHolderFailure | null = null;
  tokenLifetimeInSeconds = 900;
  readonly exchanged: { readonly code: string; readonly codeVerifier: string }[] = [];
  readonly refreshed: string[] = [];
  readonly revoked: string[] = [];
  private issued = 0;

  constructor(private readonly now: () => Date) {}

  async createConsent(): Promise<Result<{ readonly externalConsentId: string }, DataHolderFailure>> {
    this.issued += 1;

    return this.failure === null
      ? ok({ externalConsentId: `urn:fake-bank:${String(this.issued)}` })
      : fail(this.failure);
  }

  authorisationUrl(input: {
    readonly externalConsentId: string;
    readonly state: string;
    readonly codeChallenge: string;
  }): string {
    return `https://bank.example/authorize?consent=${input.externalConsentId}&state=${input.state}&challenge=${input.codeChallenge}`;
  }

  async exchangeCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<Result<DataHolderTokens, DataHolderFailure>> {
    this.exchanged.push(input);

    return this.tokens();
  }

  async refresh(refreshToken: string): Promise<Result<DataHolderTokens, DataHolderFailure>> {
    this.refreshed.push(refreshToken);

    return this.tokens();
  }

  async listAccounts(): Promise<Result<readonly SharedAccount[], DataHolderFailure>> {
    return this.failure === null ? ok(this.accounts) : fail(this.failure);
  }

  async listTransactions(input: {
    readonly account: { readonly externalId: string };
  }): Promise<Result<readonly SharedTransaction[], DataHolderFailure>> {
    return this.failure === null
      ? ok(this.statements.get(input.account.externalId) ?? [])
      : fail(this.failure);
  }

  async revokeConsent(externalConsentId: string): Promise<Result<void, DataHolderFailure>> {
    this.revoked.push(externalConsentId);

    return this.revocationFailure === null ? ok(undefined) : fail(this.revocationFailure);
  }

  private tokens(): Result<DataHolderTokens, DataHolderFailure> {
    if (this.failure !== null) {
      return fail(this.failure);
    }

    this.issued += 1;

    return ok({
      accessToken: `access-${String(this.issued)}`,
      refreshToken: `refresh-${String(this.issued)}`,
      accessTokenExpiresAt: new Date(this.now().getTime() + this.tokenLifetimeInSeconds * 1000),
    });
  }
}
