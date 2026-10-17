import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { SavingsGoal } from './savings-goal.js';

export interface SavingsGoalRepository {
  /**
   * Inserts a new goal, or appends its new movements under optimistic locking.
   * Throws `ConcurrentModificationError` when another request changed it first.
   */
  save(goal: SavingsGoal): Promise<void>;
  /** Somebody else's goal is `null`, exactly like one that does not exist. */
  findByIdAndUserId(goalId: UniqueEntityId, userId: UniqueEntityId): Promise<SavingsGoal | null>;
}
