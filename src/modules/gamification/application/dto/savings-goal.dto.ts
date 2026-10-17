import type { GoalPurpose } from '../../domain/goal-purpose.js';
import type { MovementDirection } from '../../domain/goal-movement.js';

export interface SavingsGoalDto {
  readonly id: string;
  readonly title: string;
  readonly purpose: GoalPurpose;
  readonly targetInCents: number;
  readonly savedInCents: number;
  readonly remainingInCents: number;
  readonly progressPercent: number;
  /** Now — a withdrawal can undo it. */
  readonly isReached: boolean;
  /** The first time — never cleared. ISO 8601. */
  readonly reachedAt: string | null;
  readonly movementCount: number;
  readonly createdAt: string;
}

export interface GoalMovementDto {
  readonly id: string;
  readonly direction: MovementDirection;
  readonly amountInCents: number;
  readonly occurredAt: string;
  readonly reachedTarget: boolean;
}

export interface CursorDto {
  readonly at: string;
  readonly id: string;
}

export interface PageDto<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor: CursorDto | null;
}

export interface PageRequest {
  readonly userId: string;
  readonly limit: number;
  readonly cursor: CursorDto | null;
}

export interface CreateSavingsGoalInput {
  readonly userId: string;
  readonly title: string;
  readonly purpose: GoalPurpose;
  readonly targetInCents: number;
}

export interface ListGoalMovementsInput extends PageRequest {
  readonly goalId: string;
}

export interface RecordGoalMovementInput {
  readonly userId: string;
  readonly goalId: string;
  readonly direction: MovementDirection;
  readonly amountInCents: number;
  readonly idempotencyKey: string | null;
}

export interface RecordedMovementOutput {
  readonly goal: SavingsGoalDto;
  readonly movement: GoalMovementDto;
  /**
   * True only on the movement that first crossed the target. The client
   * celebrates on this and on nothing it computes itself.
   */
  readonly reachedNow: boolean;
}
