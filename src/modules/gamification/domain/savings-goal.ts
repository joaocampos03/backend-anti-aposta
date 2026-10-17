import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { SavingsGoalReached } from './events/savings-goal-reached.js';
import { GamificationError } from './gamification.errors.js';
import type { GoalAmount } from './goal-amount.js';
import { GoalMovement, type MovementDirection } from './goal-movement.js';
import { GoalProgress } from './goal-progress.js';
import type { GoalPurpose } from './goal-purpose.js';
import type { GoalTitle } from './goal-title.js';

interface SavingsGoalProperties {
  readonly userId: UniqueEntityId;
  readonly title: GoalTitle;
  readonly purpose: GoalPurpose;
  readonly target: GoalAmount;
  readonly createdAt: Date;
  /** The first time the balance reached the target; `null` until then, and never cleared. */
  readonly reachedAt: Date | null;
  /** Oldest first, the order they happened in. */
  readonly movements: readonly GoalMovement[];
  readonly version: number;
}

export interface MovementRequest {
  readonly id: UniqueEntityId;
  readonly direction: MovementDirection;
  readonly amount: GoalAmount;
  readonly occurredAt: Date;
  readonly idempotencyKey: string | null;
}

/**
 * Money the user is putting aside, and the ledger of what they say they moved.
 *
 * **Self-reported, and the model says so.** Open Finance shows a statement; it
 * does not show that a transfer was meant as savings and never sees cash in a
 * drawer. So the user records the movements and this aggregate keeps the
 * ledger: the balance is summed from it every time, never stored, because a
 * kept total and its history can disagree and the reader would believe the
 * total.
 *
 * Autonomy is the SDT mechanic here — the name, the purpose and the target are
 * all the user's — and competence is the visible history behind the balance.
 */
export class SavingsGoal extends AggregateRoot {
  private reachedAt: Date | null;
  private readonly movements: GoalMovement[];
  private readonly recorded: GoalMovement[] = [];

  private constructor(
    id: UniqueEntityId,
    private readonly properties: SavingsGoalProperties,
  ) {
    super(id);
    this.reachedAt = properties.reachedAt;
    this.movements = [...properties.movements];
  }

  /** A new goal starts empty, and the target is positive, so nothing is reached by creating one. */
  static create(input: {
    readonly id: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly title: GoalTitle;
    readonly purpose: GoalPurpose;
    readonly target: GoalAmount;
    readonly createdAt: Date;
  }): SavingsGoal {
    return new SavingsGoal(input.id, { ...input, reachedAt: null, movements: [], version: 0 });
  }

  static restore(id: UniqueEntityId, properties: SavingsGoalProperties): SavingsGoal {
    const goal = new SavingsGoal(id, properties);

    if (goal.savedInCents() < 0) {
      throw new Error(`Corrupted gamification_savings_goals ledger: ${id.value}`);
    }

    return goal;
  }

  /**
   * Records one movement, or refuses a withdrawal the balance cannot cover. A
   * goal never holds less than nothing, and silently clamping would leave the
   * user with a balance they never agreed to.
   */
  record(
    request: MovementRequest,
  ): Result<GoalMovement, GamificationError<'INSUFFICIENT_BALANCE'>> {
    const before = this.savedInCents();

    if (request.direction === 'WITHDRAWAL' && request.amount.inCents > before) {
      return fail(GamificationError.of('INSUFFICIENT_BALANCE'));
    }

    const movement = GoalMovement.record({
      ...request,
      reachedTarget: this.crossesTarget(before, request),
    });

    this.movements.push(movement);
    this.recorded.push(movement);
    this.markReachedBy(movement);

    return ok(movement);
  }

  /** The movement an earlier request with this key already recorded, if any. */
  movementWithKey(idempotencyKey: string): GoalMovement | null {
    return this.movements.find((movement) => movement.idempotencyKey === idempotencyKey) ?? null;
  }

  savedInCents(): number {
    return this.movements.reduce((balance, movement) => balance + movement.signedCents(), 0);
  }

  progress(): GoalProgress {
    return GoalProgress.of(this.savedInCents(), this.target.inCents);
  }

  /** Movements recorded since this aggregate was loaded, for the repository to append. */
  newMovements(): readonly GoalMovement[] {
    return [...this.recorded];
  }

  /**
   * Below the target before, at or past it after — and only the first time. The
   * celebration that hangs off this must never fire for a deposit into a goal
   * that was already finished, and never at 90%: no near-miss.
   */
  private crossesTarget(beforeInCents: number, request: MovementRequest): boolean {
    if (this.reachedAt !== null || request.direction !== 'DEPOSIT') {
      return false;
    }

    const after = beforeInCents + request.amount.inCents;

    return beforeInCents < this.target.inCents && after >= this.target.inCents;
  }

  private markReachedBy(movement: GoalMovement): void {
    if (!movement.reachedTarget) {
      return;
    }

    this.reachedAt = movement.occurredAt;
    this.addEvent(
      new SavingsGoalReached({
        userId: this.userId,
        goalId: this.id,
        reachedAt: movement.occurredAt,
      }),
    );
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get title(): GoalTitle {
    return this.properties.title;
  }

  get purpose(): GoalPurpose {
    return this.properties.purpose;
  }

  get target(): GoalAmount {
    return this.properties.target;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }

  get firstReachedAt(): Date | null {
    return this.reachedAt;
  }

  get movementCount(): number {
    return this.movements.length;
  }

  get version(): number {
    return this.properties.version;
  }
}
