import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Transaction } from './transaction.js';

export interface TransactionRepository {
  save(transaction: Transaction): Promise<void>;
  findByIdAndUserId(
    transactionId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<Transaction | null>;
  /**
   * Which of the DataHolder's ids this account already holds, so that a second
   * synchronisation of the same statement ingests nothing twice.
   */
  findIngestedExternalIds(
    accountId: UniqueEntityId,
    candidates: readonly string[],
  ): Promise<ReadonlySet<string>>;
  /**
   * The override marker on the projected row. It is written separately from
   * `save` so a re-ingestion of the same transaction cannot quietly erase a
   * correction somebody made.
   */
  markOverride(transactionId: UniqueEntityId, overriddenAt: Date | null): Promise<void>;
  /** Revocation deletes the derived data, not just the token. */
  deleteAllForUser(userId: UniqueEntityId): Promise<void>;
}
