import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * The two products the sandbox offers. The real specification serves credit
 * cards from a separate API (`credit-cards-accounts`); folding them into
 * `/accounts` is a deliberate simplification of the sandbox, stated in its
 * CLAUDE.md, not a claim about the specification.
 */
export type AccountType = 'CONTA_DEPOSITO_A_VISTA' | 'CARTAO_CREDITO';

interface BankAccountProperties {
  /** The platform user standing in for the bank's own login. */
  readonly customerId: UniqueEntityId;
  readonly type: AccountType;
  readonly brandName: string;
  readonly companyCnpj: string;
  readonly compeCode: string;
  readonly branchCode: string;
  /** In full, as a bank holds it. Masking is the DataRecipient's job. */
  readonly number: string;
  readonly checkDigit: string;
  readonly openedAt: Date;
}

/** An account at the simulated institution, owned by exactly one customer. */
export class BankAccount extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: BankAccountProperties,
  ) {
    super(id);
  }

  static open(input: { readonly id: UniqueEntityId } & BankAccountProperties): BankAccount {
    const { id, ...properties } = input;

    return new BankAccount(id, properties);
  }

  static restore(id: UniqueEntityId, properties: BankAccountProperties): BankAccount {
    return new BankAccount(id, properties);
  }

  get customerId(): UniqueEntityId {
    return this.properties.customerId;
  }

  get type(): AccountType {
    return this.properties.type;
  }

  get brandName(): string {
    return this.properties.brandName;
  }

  get companyCnpj(): string {
    return this.properties.companyCnpj;
  }

  get compeCode(): string {
    return this.properties.compeCode;
  }

  get branchCode(): string {
    return this.properties.branchCode;
  }

  get number(): string {
    return this.properties.number;
  }

  get checkDigit(): string {
    return this.properties.checkDigit;
  }

  get openedAt(): Date {
    return this.properties.openedAt;
  }

  isOwnedBy(customerId: UniqueEntityId): boolean {
    return this.properties.customerId.equals(customerId);
  }

  isCreditCard(): boolean {
    return this.properties.type === 'CARTAO_CREDITO';
  }
}
