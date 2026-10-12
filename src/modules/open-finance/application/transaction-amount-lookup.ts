import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { TransactionRepository } from '../domain/transaction.repository.js';

/**
 * What `open-finance` publishes so a restored classification can be reframed
 * without the caller fetching the row again. Scoped by owner, like every other
 * read in this context.
 */
export class TransactionAmountLookup {
  constructor(private readonly transactions: TransactionRepository) {}

  async amountInCentsOf(transactionId: string, userId: string): Promise<number | null> {
    const transaction = await this.transactions.findByIdAndUserId(
      UniqueEntityId.restore(transactionId),
      UniqueEntityId.restore(userId),
    );

    return transaction?.amount.amountInCents ?? null;
  }
}
