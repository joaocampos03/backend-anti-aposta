import type { PrismaClient } from '@prisma/client';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { isUniqueViolationOn, type PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { BadgeCollection } from '../domain/badge-collection.js';
import type { BadgeCollectionRepository } from '../domain/badge-collection.repository.js';
import { ConcurrentModificationError } from '../domain/gamification.errors.js';
import { BadgeCollectionMapper } from './badge-collection.mapper.js';

/**
 * One aggregate over two tables, written in one transaction. The collection
 * row's `version` is the lock: the screen's read and an event reaction can
 * evaluate the same person at once, and only the one that moved the version on
 * inserts its badges — so a badge is awarded, and announced, once.
 */
export class PrismaBadgeCollectionRepository implements BadgeCollectionRepository {
  constructor(private readonly client: PrismaClient) {}

  async save(collection: BadgeCollection): Promise<void> {
    try {
      await this.client.$transaction(async (transaction) => {
        await this.writeCollection(transaction, collection);
        await transaction.badge.deleteMany({
          where: { collectionId: collection.id.value, kind: { in: [...collection.forgottenKinds()] } },
        });
        await transaction.badge.createMany({
          data: collection.newBadges().map((badge) => BadgeCollectionMapper.badgeToRow(collection.id, badge)),
        });
      });
    } catch (cause) {
      // Two first evaluations of a person with no collection yet: both tried to create it.
      if (isUniqueViolationOn(cause, 'user_id') || isUniqueViolationOn(cause, 'userId')) {
        throw new ConcurrentModificationError();
      }

      throw cause;
    }
  }

  async findByUserId(userId: UniqueEntityId): Promise<BadgeCollection | null> {
    const row = await this.client.badgeCollection.findUnique({
      where: { userId: userId.value },
      include: { badges: { orderBy: [{ awardedAt: 'asc' }, { kind: 'asc' }] } },
    });

    return row === null ? null : BadgeCollectionMapper.toDomain(row);
  }

  private async writeCollection(transaction: PrismaTransactionClient, collection: BadgeCollection): Promise<void> {
    const row = BadgeCollectionMapper.toRow(collection);
    const updated = await transaction.badgeCollection.updateMany({
      where: { id: row.id, version: row.version },
      data: { version: row.version + 1 },
    });

    if (updated.count === 1) {
      return;
    }

    const exists = await transaction.badgeCollection.findUnique({ where: { id: row.id }, select: { id: true } });

    if (exists !== null) {
      throw new ConcurrentModificationError();
    }

    await transaction.badgeCollection.create({ data: row });
  }
}
