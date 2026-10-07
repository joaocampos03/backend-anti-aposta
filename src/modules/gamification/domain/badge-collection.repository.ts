import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BadgeCollection } from './badge-collection.js';

export interface BadgeCollectionRepository {
  save(collection: BadgeCollection): Promise<void>;
  findByUserId(userId: UniqueEntityId): Promise<BadgeCollection | null>;
}
