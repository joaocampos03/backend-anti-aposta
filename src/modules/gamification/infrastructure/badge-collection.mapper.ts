import type { Badge as BadgeRow, BadgeCollection as BadgeCollectionRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BadgeCollection } from '../domain/badge-collection.js';
import { Badge } from '../domain/badge.js';

export class BadgeCollectionMapper {
  static toDomain(row: BadgeCollectionRow & { readonly badges: readonly BadgeRow[] }): BadgeCollection {
    return BadgeCollection.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      badges: row.badges.map((badge) =>
        Badge.restore({ id: UniqueEntityId.restore(badge.id), kind: badge.kind, awardedAt: badge.awardedAt }),
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

  /** A badge exists once per collection and kind, which the table's unique index also guards. */
  static badgeToRow(collectionId: UniqueEntityId, badge: Badge): BadgeRow {
    return {
      id: badge.id.value,
      collectionId: collectionId.value,
      kind: badge.kind,
      awardedAt: badge.awardedAt,
    };
  }
}
