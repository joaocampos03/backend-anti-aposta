import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { TransactionClassification } from '../domain/transaction-classification.js';
import type { TransactionClassificationRepository } from '../domain/transaction-classification.repository.js';
import { TransactionClassificationMapper } from './transaction-classification.mapper.js';

export class PrismaTransactionClassificationRepository
  implements TransactionClassificationRepository
{
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(classification: TransactionClassification): Promise<void> {
    const row = TransactionClassificationMapper.toRow(classification);

    await this.client.transactionClassification.upsert({
      where: { transactionId: row.transactionId },
      create: row,
      update: row,
    });
  }

  async findByTransactionIdAndUserId(
    transactionId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<TransactionClassification | null> {
    const row = await this.client.transactionClassification.findFirst({
      where: { transactionId: transactionId.value, userId: userId.value },
    });

    return row === null ? null : TransactionClassificationMapper.toDomain(row);
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    await this.client.transactionClassification.deleteMany({ where: { userId: userId.value } });
  }
}
