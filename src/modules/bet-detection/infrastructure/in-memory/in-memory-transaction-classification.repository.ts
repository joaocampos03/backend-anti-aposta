import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { TransactionClassification } from '../../domain/transaction-classification.js';
import type { TransactionClassificationRepository } from '../../domain/transaction-classification.repository.js';

export class InMemoryTransactionClassificationRepository
  implements TransactionClassificationRepository
{
  readonly classifications: TransactionClassification[] = [];

  async save(classification: TransactionClassification): Promise<void> {
    const index = this.classifications.findIndex((stored) =>
      stored.id.equals(classification.id),
    );

    if (index >= 0) {
      this.classifications.splice(index, 1, classification);

      return;
    }

    this.classifications.push(classification);
  }

  async findByTransactionIdAndUserId(
    transactionId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<TransactionClassification | null> {
    return (
      this.classifications.find(
        (stored) => stored.id.equals(transactionId) && stored.userId.equals(userId),
      ) ?? null
    );
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    for (let index = this.classifications.length - 1; index >= 0; index -= 1) {
      if (this.classifications[index]?.userId.equals(userId) === true) {
        this.classifications.splice(index, 1);
      }
    }
  }
}
