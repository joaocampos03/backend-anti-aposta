import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { BadgeCollection } from '../domain/badge-collection.js';
import type { BadgeCollectionRepository } from '../domain/badge-collection.repository.js';
import { BadgeCollectionMapper } from './badge-collection.mapper.js';

export class PrismaBadgeCollectionRepository implements BadgeCollectionRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(collection: BadgeCollection): Promise<void> {
    const row = BadgeCollectionMapper.toRow(collection);

    await this.client.badgeCollection.upsert({
      where: { userId: row.userId },
      create: row,
      update: row,
    });
  }

  async findByUserId(userId: UniqueEntityId): Promise<BadgeCollection | null> {
    const row = await this.client.badgeCollection.findUnique({
      where: { userId: userId.value },
      include: { badges: true },
    });

    return row === null ? null : BadgeCollectionMapper.toDomain(row);
  }
}
