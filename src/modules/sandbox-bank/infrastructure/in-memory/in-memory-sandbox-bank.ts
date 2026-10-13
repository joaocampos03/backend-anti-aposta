import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankSecrets } from '../../application/ports/bank-secrets.port.js';
import type {
  ClientRegistry,
  RegisteredClient,
} from '../../application/ports/client-registry.port.js';
import type { AuthorisationCode } from '../../domain/authorisation-code.js';
import type { AuthorisationCodeRepository } from '../../domain/authorisation-code.repository.js';
import type { BankAccount } from '../../domain/bank-account.js';
import type { BankAccountRepository } from '../../domain/bank-account.repository.js';
import type { Consent } from '../../domain/consent.js';
import type { ConsentRepository } from '../../domain/consent.repository.js';
import type { IssuedToken } from '../../domain/issued-token.js';
import type { IssuedTokenRepository } from '../../domain/issued-token.repository.js';
import type { LedgerEntry } from '../../domain/ledger-entry.js';
import type {
  LedgerEntryRepository,
  StatementPage,
  StatementWindow,
} from '../../domain/ledger-entry.repository.js';

/** Replaces by id, or appends: the shape every fake here shares. */
function upsert<TItem extends { readonly id: UniqueEntityId }>(
  items: TItem[],
  item: TItem,
): void {
  const index = items.findIndex((stored) => stored.id.equals(item.id));

  if (index >= 0) {
    items.splice(index, 1, item);

    return;
  }

  items.push(item);
}

export class InMemoryBankAccountRepository implements BankAccountRepository {
  readonly accounts: BankAccount[] = [];

  async save(account: BankAccount): Promise<void> {
    upsert(this.accounts, account);
  }

  async findByCustomerId(customerId: UniqueEntityId): Promise<readonly BankAccount[]> {
    return this.accounts.filter((account) => account.isOwnedBy(customerId));
  }

  async findByIdAndCustomerId(
    accountId: UniqueEntityId,
    customerId: UniqueEntityId,
  ): Promise<BankAccount | null> {
    return (
      this.accounts.find(
        (account) => account.id.equals(accountId) && account.isOwnedBy(customerId),
      ) ?? null
    );
  }

  async findByIds(accountIds: readonly UniqueEntityId[]): Promise<readonly BankAccount[]> {
    return this.accounts.filter((account) => accountIds.some((id) => id.equals(account.id)));
  }
}

export class InMemoryLedgerEntryRepository implements LedgerEntryRepository {
  readonly entries: LedgerEntry[] = [];

  async save(entry: LedgerEntry): Promise<void> {
    upsert(this.entries, entry);
  }

  async findPageByAccountId(
    accountId: UniqueEntityId,
    window: StatementWindow,
    page: { readonly number: number; readonly size: number },
  ): Promise<StatementPage> {
    const matching = this.entries
      .filter((entry) => entry.accountId.equals(accountId))
      .filter((entry) => entry.bookedAt >= window.from && entry.bookedAt <= window.to)
      .sort((left, right) => right.bookedAt.getTime() - left.bookedAt.getTime());
    const start = (page.number - 1) * page.size;

    return { entries: matching.slice(start, start + page.size), totalRecords: matching.length };
  }
}

export class InMemoryConsentRepository implements ConsentRepository {
  readonly consents: Consent[] = [];

  async save(consent: Consent): Promise<void> {
    upsert(this.consents, consent);
  }

  async findById(consentId: UniqueEntityId): Promise<Consent | null> {
    return this.consents.find((consent) => consent.id.equals(consentId)) ?? null;
  }

  async findByIdAndClientId(consentId: UniqueEntityId, clientId: string): Promise<Consent | null> {
    const consent = await this.findById(consentId);

    return consent?.belongsToClient(clientId) === true ? consent : null;
  }
}

export class InMemoryAuthorisationCodeRepository implements AuthorisationCodeRepository {
  readonly codes: AuthorisationCode[] = [];

  async save(code: AuthorisationCode): Promise<void> {
    upsert(this.codes, code);
  }

  async findByFingerprint(codeFingerprint: string): Promise<AuthorisationCode | null> {
    return this.codes.find((code) => code.codeFingerprint === codeFingerprint) ?? null;
  }
}

export class InMemoryIssuedTokenRepository implements IssuedTokenRepository {
  readonly tokens: IssuedToken[] = [];

  async save(token: IssuedToken): Promise<void> {
    upsert(this.tokens, token);
  }

  async findByFingerprint(tokenFingerprint: string): Promise<IssuedToken | null> {
    return this.tokens.find((token) => token.tokenFingerprint === tokenFingerprint) ?? null;
  }

  async revokeAllForConsent(consentId: UniqueEntityId, moment: Date): Promise<void> {
    for (const token of this.tokens) {
      if (token.consentId?.equals(consentId) === true) {
        token.revoke(moment);
      }
    }
  }
}

/** Predictable values, so a test can present the code it was just handed. */
export class InMemoryBankSecrets implements BankSecrets {
  private minted = 0;

  mint(): string {
    this.minted += 1;

    return `minted-${String(this.minted)}`;
  }

  fingerprint(value: string): string {
    return `fingerprint:${value}`;
  }

  challengeOf(codeVerifier: string): string {
    return `s256:${codeVerifier}`;
  }

  digits(length: number): string {
    return '4'.repeat(length);
  }
}

export class InMemoryClientRegistry implements ClientRegistry {
  constructor(
    private readonly client: RegisteredClient,
    private readonly secret: string,
  ) {}

  authenticate(clientId: string, clientSecret: string): RegisteredClient | null {
    return clientId === this.client.clientId && clientSecret === this.secret ? this.client : null;
  }

  findById(clientId: string): RegisteredClient | null {
    return clientId === this.client.clientId ? this.client : null;
  }
}
