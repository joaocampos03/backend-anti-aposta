import type { GoalPurpose } from '../../domain/goal-purpose.js';
import type { MovementDirection } from '../../domain/goal-movement.js';

/** Where a page ends: the sort key of its last row. Opaque to the client. */
export interface PageCursor {
  readonly at: Date;
  readonly id: string;
}

export interface Page<TRow> {
  readonly rows: readonly TRow[];
  readonly nextCursor: PageCursor | null;
}

/** One goal as the list needs it, with the balance summed in the query. */
export interface SavingsGoalSummaryRow {
  readonly id: string;
  readonly title: string;
  readonly purpose: GoalPurpose;
  readonly targetInCents: number;
  readonly savedInCents: number;
  readonly reachedAt: Date | null;
  readonly movementCount: number;
  readonly createdAt: Date;
}

export interface GoalMovementRow {
  readonly id: string;
  readonly direction: MovementDirection;
  readonly amountInCents: number;
  readonly occurredAt: Date;
  readonly reachedTarget: boolean;
}

/**
 * The savings goals as a read model. Listing twenty goals does not hydrate
 * twenty ledgers: the balance is summed in SQL from the same movements the
 * aggregate sums, so the two cannot disagree. Every question is scoped by owner.
 */
export interface SavingsGoalLedgerQuery {
  /** Newest first. */
  goalsOf(userId: string, limit: number, cursor: PageCursor | null): Promise<Page<SavingsGoalSummaryRow>>;
  /** Newest first; `null` when the goal is not the caller's. */
  movementsOf(
    userId: string,
    goalId: string,
    limit: number,
    cursor: PageCursor | null,
  ): Promise<Page<GoalMovementRow> | null>;
}
