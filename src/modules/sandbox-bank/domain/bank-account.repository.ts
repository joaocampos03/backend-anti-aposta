import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankAccount } from './bank-account.js';

export interface BankAccountRepository {
  save(account: BankAccount): Promise<void>;
  /** Checking account first, then the card: the authorisation screen lists them stably. */
  findByCustomerId(customerId: UniqueEntityId): Promise<readonly BankAccount[]>;
  findByIdAndCustomerId(
    accountId: UniqueEntityId,
    customerId: UniqueEntityId,
  ): Promise<BankAccount | null>;
  /** The accounts a consent shares, in the same order. */
  findByIds(accountIds: readonly UniqueEntityId[]): Promise<readonly BankAccount[]>;
}
