import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { ConnectedAccount } from '../domain/connected-account.js';
import type { ConnectedAccountRepository } from '../domain/connected-account.repository.js';
import { ConnectedAccountMapper } from './connected-account.mapper.js';

export class PrismaConnectedAccountRepository implements ConnectedAccountRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(account: ConnectedAccount): Promise<void> {
    const row = ConnectedAccountMapper.toRow(account);

    await this.client.connectedAccount.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }

  async findByConsentId(consentId: UniqueEntityId): Promise<readonly ConnectedAccount[]> {
    const rows = await this.client.connectedAccount.findMany({
      where: { consentId: consentId.value },
      orderBy: { connectedAt: 'asc' },
    });

    return rows.map((row) => ConnectedAccountMapper.toDomain(row));
  }

  async findByIdAndUserId(
    accountId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<ConnectedAccount | null> {
    const row = await this.client.connectedAccount.findFirst({
      where: { id: accountId.value, userId: userId.value },
    });

    return row === null ? null : ConnectedAccountMapper.toDomain(row);
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    await this.client.connectedAccount.deleteMany({ where: { userId: userId.value } });
  }
}
