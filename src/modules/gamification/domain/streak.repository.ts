import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Streak } from './streak.js';

export interface StreakRepository {
  save(streak: Streak): Promise<void>;
  findByUserId(userId: UniqueEntityId): Promise<Streak | null>;
}
