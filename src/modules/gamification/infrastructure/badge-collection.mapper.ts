import type { Badge as BadgeRow, BadgeCollection as BadgeCollectionRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BadgeCollection } from '../domain/badge-collection.js';
import { Badge } from '../domain/badge.js';

export class BadgeCollectionMapper {
  static toDomain(row: BadgeCollectionRow & { readonly badges: readonly BadgeRow[] }): BadgeCollection {
    return BadgeCollection.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      badges: row.badges.map((badge) =>
        Badge.restore({ kind: badge.kind, awardedAt: badge.awardedAt }),
      ),
      createdAt: row.createdAt,
      version: row.version,
    });
  }

  static toRow(collection: BadgeCollection): BadgeCollectionRow {
    return {
      id: collection.id.value,
      userId: collection.userId.value,
      createdAt: collection.createdAt,
      version: collection.version,
    };
  }
}
