import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BadgeCollection } from '../../domain/badge-collection.js';
import type { BadgeCollectionRepository } from '../../domain/badge-collection.repository.js';

export class InMemoryBadgeCollectionRepository implements BadgeCollectionRepository {
  readonly collections: BadgeCollection[] = [];

  async save(collection: BadgeCollection): Promise<void> {
    const index = this.collections.findIndex((stored) =>
      stored.userId.equals(collection.userId),
    );

    if (index >= 0) {
      this.collections.splice(index, 1, collection);

      return;
    }

    this.collections.push(collection);
  }

  async findByUserId(userId: UniqueEntityId): Promise<BadgeCollection | null> {
    return this.collections.find((stored) => stored.userId.equals(userId)) ?? null;
  }
}
