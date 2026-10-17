import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { ConcurrentModificationError } from '../../domain/gamification.errors.js';
import type { SavingsGoal } from '../../domain/savings-goal.js';
import type { SavingsGoalRepository } from '../../domain/savings-goal.repository.js';

export class InMemorySavingsGoalRepository implements SavingsGoalRepository {
  readonly goals: SavingsGoal[] = [];
  /** Makes the next save lose the race, as a second request would make it. */
  conflictOnNextSave = false;

  async save(goal: SavingsGoal): Promise<void> {
    if (this.conflictOnNextSave) {
      this.conflictOnNextSave = false;

      throw new ConcurrentModificationError();
    }

    if (!this.goals.some((stored) => stored.equals(goal))) {
      this.goals.push(goal);
    }
  }

  async findByIdAndUserId(goalId: UniqueEntityId, userId: UniqueEntityId): Promise<SavingsGoal | null> {
    return this.goals.find((goal) => goal.id.equals(goalId) && goal.userId.equals(userId)) ?? null;
  }
}
