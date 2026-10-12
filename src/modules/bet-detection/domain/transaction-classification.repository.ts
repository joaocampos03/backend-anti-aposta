import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { TransactionClassification } from './transaction-classification.js';

export interface TransactionClassificationRepository {
  save(classification: TransactionClassification): Promise<void>;
  /** Scoped by owner: a query by id alone would answer about another user's data. */
  findByTransactionIdAndUserId(
    transactionId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<TransactionClassification | null>;
  /** Revocation takes the classifications and the signals with it. */
  deleteAllForUser(userId: UniqueEntityId): Promise<void>;
}
