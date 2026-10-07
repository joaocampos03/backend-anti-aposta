import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Streak } from '../../domain/streak.js';
import type { StreakRepository } from '../../domain/streak.repository.js';

export class InMemoryStreakRepository implements StreakRepository {
  readonly streaks: Streak[] = [];

  async save(streak: Streak): Promise<void> {
    const index = this.streaks.findIndex((stored) => stored.userId.equals(streak.userId));

    if (index >= 0) {
      this.streaks.splice(index, 1, streak);

      return;
    }

    this.streaks.push(streak);
  }

  async findByUserId(userId: UniqueEntityId): Promise<Streak | null> {
    return this.streaks.find((stored) => stored.userId.equals(userId)) ?? null;
  }
}
