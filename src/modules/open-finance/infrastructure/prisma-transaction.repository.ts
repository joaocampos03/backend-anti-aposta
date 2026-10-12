import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Transaction } from '../domain/transaction.js';
import type { TransactionRepository } from '../domain/transaction.repository.js';
import { TransactionMapper } from './transaction.mapper.js';

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(
    private readonly client: PrismaTransactionClient,
    private readonly ingestedAt: () => Date,
  ) {}

  async save(transaction: Transaction): Promise<void> {
    const row = TransactionMapper.toRow(transaction, this.ingestedAt());
    const { overriddenAt: _overriddenAt, ingestedAt, ...updatable } = row;

    await this.client.transaction.upsert({
      where: { id: row.id },
      create: row,
      // `ingestedAt` and the override marker belong to the rows that wrote
      // them: a re-ingestion must not pretend the transaction is new, and must
      // not erase a correction.
      update: { ...updatable, ingestedAt },
    });
  }

  async findByIdAndUserId(
    transactionId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<Transaction | null> {
    const row = await this.client.transaction.findFirst({
      where: { id: transactionId.value, userId: userId.value },
    });

    return row === null ? null : TransactionMapper.toDomain(row);
  }

  async markOverride(transactionId: UniqueEntityId, overriddenAt: Date | null): Promise<void> {
    await this.client.transaction.update({
      where: { id: transactionId.value },
      data: { overriddenAt },
    });
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    await this.client.transaction.deleteMany({ where: { userId: userId.value } });
  }
}
