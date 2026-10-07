import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Inbox } from '../domain/inbox.js';
import type { InboxRepository } from '../domain/inbox.repository.js';
import { InboxMapper } from './inbox.mapper.js';

export class PrismaInboxRepository implements InboxRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(inbox: Inbox): Promise<void> {
    const row = InboxMapper.toRow(inbox);

    await this.client.inbox.upsert({ where: { userId: row.userId }, create: row, update: row });
  }

  async findByUserId(userId: UniqueEntityId): Promise<Inbox | null> {
    const row = await this.client.inbox.findUnique({ where: { userId: userId.value } });

    return row === null ? null : InboxMapper.toDomain(row);
  }
}
