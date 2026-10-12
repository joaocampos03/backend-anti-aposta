import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { MaskedAccountNumber } from './masked-account-number.js';
import type { AccountKind } from './transaction-attributes.js';

interface ConnectedAccountProperties {
  readonly userId: UniqueEntityId;
  readonly consentId: UniqueEntityId;
  /** The DataHolder's id for this account, which a statement is requested by. */
  readonly externalId: string;
  readonly institution: string;
  /** A short institution name for a row that already carries a merchant name. */
  readonly shortName: string;
  readonly product: string;
  readonly maskedNumber: MaskedAccountNumber;
  readonly kind: AccountKind;
  readonly connectedAt: Date;
}

/**
 * An account the user shared. It exists only while its consent is authorised,
 * which is why the account filter offers exactly what is actually shared: a
 * person who shared one of two accounts sees one.
 */
export class ConnectedAccount extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: ConnectedAccountProperties,
  ) {
    super(id);
  }

  static connect(
    input: { readonly id: UniqueEntityId } & ConnectedAccountProperties,
  ): ConnectedAccount {
    const { id, ...properties } = input;

    return new ConnectedAccount(id, properties);
  }

  static restore(
    id: UniqueEntityId,
    properties: ConnectedAccountProperties,
  ): ConnectedAccount {
    return new ConnectedAccount(id, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get consentId(): UniqueEntityId {
    return this.properties.consentId;
  }

  get externalId(): string {
    return this.properties.externalId;
  }

  get institution(): string {
    return this.properties.institution;
  }

  get shortName(): string {
    return this.properties.shortName;
  }

  get product(): string {
    return this.properties.product;
  }

  get maskedNumber(): MaskedAccountNumber {
    return this.properties.maskedNumber;
  }

  get kind(): AccountKind {
    return this.properties.kind;
  }

  get connectedAt(): Date {
    return this.properties.connectedAt;
  }
}
