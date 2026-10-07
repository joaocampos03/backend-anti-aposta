import type { Streak as StreakRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Streak } from '../domain/streak.js';

export class StreakMapper {
  static toDomain(row: StreakRow): Streak {
    return Streak.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      currentDays: row.currentDays,
      longestDays: row.longestDays,
      startedAt: row.startedAt,
      version: row.version,
    });
  }

  static toRow(streak: Streak): StreakRow {
    return {
      id: streak.id.value,
      userId: streak.userId.value,
      currentDays: streak.currentDays,
      longestDays: streak.longestDays,
      startedAt: streak.startedAt,
      version: streak.version,
    };
  }
}
