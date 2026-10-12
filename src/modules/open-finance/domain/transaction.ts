import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { Money } from '@shared/domain/money.js';
import { ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from './consent.js';
import type { Counterparty } from './counterparty.js';
import type { OpenFinanceError } from './open-finance.errors.js';
import type {
  PaymentMethod,
  TransactionCategory,
  TransactionStatus,
} from './transaction-attributes.js';

/**
 * `bet-detection`'s verdict, projected onto the transaction so the statement
 * can be filtered and totalled in one query.
 *
 * It is a **copy**, kept current by subscribing to that context's events. The
 * authoritative record lives there; a cross-context join to read it would be
 * the shortcut that makes the two contexts one.
 *
 * The three unions are restated here rather than imported, for the same
 * reason: a projection owns its own shape. If `bet-detection` ever adds a
 * policy, this copy failing to compile is the point at which somebody decides
 * what the statement should show for it.
 */
export type BetMarkReason = 'GAMBLING_MCC' | 'LICENSED_CNPJ' | 'DESCRIPTION_KEYWORD';
export type BetMarkConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type BetMarkSource = 'POLICY' | 'USER_OVERRIDE';

export interface BetMark {
  readonly matchedBy: BetMarkReason;
  readonly confidence: BetMarkConfidence;
  readonly source: BetMarkSource;
}

interface TransactionProperties {
  readonly userId: UniqueEntityId;
  readonly accountId: UniqueEntityId;
  /**
   * The DataHolder's id for the movement. Unique per account, which is what
   * makes synchronising the same statement twice ingest nothing the second time.
   */
  readonly externalId: string;
  readonly occurredAt: Date;
  readonly amount: Money;
  readonly counterparty: Counterparty;
  readonly category: TransactionCategory;
  readonly method: PaymentMethod;
  readonly status: TransactionStatus;
  readonly betMark: BetMark | null;
}

/**
 * One financial movement shared by a connected account.
 *
 * The amount is signed: negative leaves the account, positive arrives. Nothing
 * strips that sign — totals report magnitudes and let their labels carry the
 * direction instead.
 *
 * @see docs/features/transactions.md
 */
export class Transaction extends AggregateRoot {
  private properties: TransactionProperties;

  private constructor(id: UniqueEntityId, properties: TransactionProperties) {
    super(id);
    this.properties = properties;
  }

  /**
   * The only way a transaction comes into existence, and it goes through the
   * consent every time.
   */
  static ingest(input: {
    readonly id: UniqueEntityId;
    readonly consent: Consent;
    readonly accountId: UniqueEntityId;
    readonly externalId: string;
    readonly occurredAt: Date;
    readonly amount: Money;
    readonly counterparty: Counterparty;
    readonly category: TransactionCategory;
    readonly method: PaymentMethod;
    readonly status: TransactionStatus;
    readonly ingestedAt: Date;
  }): Result<Transaction, OpenFinanceError<'CONSENT_NOT_AUTHORISED'>> {
    const authorised = input.consent.authoriseIngestionAt(input.ingestedAt);

    if (!authorised.ok) {
      return authorised;
    }

    return ok(
      new Transaction(input.id, {
        userId: input.consent.userId,
        accountId: input.accountId,
        externalId: input.externalId,
        occurredAt: input.occurredAt,
        amount: input.amount,
        counterparty: input.counterparty,
        category: input.category,
        method: input.method,
        status: input.status,
        betMark: null,
      }),
    );
  }

  static restore(id: UniqueEntityId, properties: TransactionProperties): Transaction {
    return new Transaction(id, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get accountId(): UniqueEntityId {
    return this.properties.accountId;
  }

  get externalId(): string {
    return this.properties.externalId;
  }

  get occurredAt(): Date {
    return this.properties.occurredAt;
  }

  get amount(): Money {
    return this.properties.amount;
  }

  get counterparty(): Counterparty {
    return this.properties.counterparty;
  }

  get category(): TransactionCategory {
    return this.properties.category;
  }

  get method(): PaymentMethod {
    return this.properties.method;
  }

  get status(): TransactionStatus {
    return this.properties.status;
  }

  get betMark(): BetMark | null {
    return this.properties.betMark;
  }

  get isBet(): boolean {
    return this.properties.betMark !== null;
  }

  /** The projection, refreshed from `bet-detection`'s current verdict. */
  projectClassification(betMark: BetMark | null): void {
    this.properties = { ...this.properties, betMark };
  }

  /**
   * A pending entry may still change value or be reversed, so every total that
   * counted it has to be recomputed when it settles.
   */
  settle(amount: Money): void {
    this.properties = { ...this.properties, amount, status: 'SETTLED' };
  }

  /** The bucket the charts count it under: a bet is a bet whatever it was filed as. */
  get spendBucket(): TransactionCategory {
    return this.isBet ? 'BETS' : this.properties.category;
  }
}
