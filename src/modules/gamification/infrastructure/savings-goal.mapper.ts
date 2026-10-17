import type {
  GoalMovement as GoalMovementRow,
  SavingsGoal as SavingsGoalRow,
} from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { GoalAmount } from '../domain/goal-amount.js';
import { GoalMovement } from '../domain/goal-movement.js';
import { GoalTitle } from '../domain/goal-title.js';
import { SavingsGoal } from '../domain/savings-goal.js';

type SavingsGoalWithMovements = SavingsGoalRow & { readonly movements: readonly GoalMovementRow[] };

export class SavingsGoalMapper {
  /** Movements must arrive oldest first: the aggregate replays them in the order they happened. */
  static toDomain(row: SavingsGoalWithMovements): SavingsGoal {
    return SavingsGoal.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      title: GoalTitle.restore(row.title),
      purpose: row.purpose,
      target: GoalAmount.restore(row.targetInCents),
      createdAt: row.createdAt,
      reachedAt: row.reachedAt,
      movements: row.movements.map((movement) => SavingsGoalMapper.movementToDomain(movement)),
      version: row.version,
    });
  }

  static toRow(goal: SavingsGoal): SavingsGoalRow {
    return {
      id: goal.id.value,
      userId: goal.userId.value,
      title: goal.title.value,
      purpose: goal.purpose,
      targetInCents: goal.target.inCents,
      createdAt: goal.createdAt,
      reachedAt: goal.firstReachedAt,
      version: goal.version,
    };
  }

  static movementToRow(goalId: UniqueEntityId, movement: GoalMovement): GoalMovementRow {
    return {
      id: movement.id.value,
      goalId: goalId.value,
      direction: movement.direction,
      amountInCents: movement.amount.inCents,
      occurredAt: movement.occurredAt,
      reachedTarget: movement.reachedTarget,
      idempotencyKey: movement.idempotencyKey,
    };
  }

  private static movementToDomain(row: GoalMovementRow): GoalMovement {
    return GoalMovement.record({
      id: UniqueEntityId.restore(row.id),
      direction: row.direction,
      amount: GoalAmount.restore(row.amountInCents),
      occurredAt: row.occurredAt,
      reachedTarget: row.reachedTarget,
      idempotencyKey: row.idempotencyKey,
    });
  }
}
