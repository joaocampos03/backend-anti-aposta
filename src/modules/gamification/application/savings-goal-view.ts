import { GoalProgress } from '../domain/goal-progress.js';
import type { GoalMovement } from '../domain/goal-movement.js';
import type { SavingsGoal } from '../domain/savings-goal.js';
import type { GoalMovementDto, SavingsGoalDto } from './dto/savings-goal.dto.js';
import type {
  GoalMovementRow,
  PageCursor,
  SavingsGoalSummaryRow,
} from './ports/savings-goal-ledger.query.port.js';

/**
 * One shape for a goal whether it came from the list's query or from the
 * aggregate a write just changed, and one `GoalProgress` deciding the figures —
 * so the card after a deposit cannot read differently from the card on reload.
 */
export function savingsGoalFromRow(row: SavingsGoalSummaryRow): SavingsGoalDto {
  const progress = GoalProgress.of(row.savedInCents, row.targetInCents);

  return {
    id: row.id,
    title: row.title,
    purpose: row.purpose,
    targetInCents: row.targetInCents,
    savedInCents: progress.savedInCents,
    remainingInCents: progress.remainingInCents,
    progressPercent: progress.percent,
    isReached: progress.isReached,
    reachedAt: row.reachedAt?.toISOString() ?? null,
    movementCount: row.movementCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function savingsGoalFromAggregate(goal: SavingsGoal): SavingsGoalDto {
  return savingsGoalFromRow({
    id: goal.id.value,
    title: goal.title.value,
    purpose: goal.purpose,
    targetInCents: goal.target.inCents,
    savedInCents: goal.savedInCents(),
    reachedAt: goal.firstReachedAt,
    movementCount: goal.movementCount,
    createdAt: goal.createdAt,
  });
}

export function movementFromRow(row: GoalMovementRow): GoalMovementDto {
  return { ...row, occurredAt: row.occurredAt.toISOString() };
}

export function movementFromAggregate(movement: GoalMovement): GoalMovementDto {
  return movementFromRow({
    id: movement.id.value,
    direction: movement.direction,
    amountInCents: movement.amount.inCents,
    occurredAt: movement.occurredAt,
    reachedTarget: movement.reachedTarget,
  });
}

export function cursorToDto(cursor: PageCursor | null): { at: string; id: string } | null {
  return cursor === null ? null : { at: cursor.at.toISOString(), id: cursor.id };
}

export function cursorFromDto(cursor: { at: string; id: string } | null): PageCursor | null {
  return cursor === null ? null : { at: new Date(cursor.at), id: cursor.id };
}
