import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { ConcurrentModificationError } from '../domain/gamification.errors.js';
import { GoalAmount } from '../domain/goal-amount.js';
import type { GoalMovement } from '../domain/goal-movement.js';
import type { SavingsGoal } from '../domain/savings-goal.js';
import type { SavingsGoalRepository } from '../domain/savings-goal.repository.js';
import type { RecordedMovementOutput, RecordGoalMovementInput } from './dto/savings-goal.dto.js';
import { gamificationFailures } from './gamification.failures.js';
import { movementFromAggregate, savingsGoalFromAggregate } from './savings-goal-view.js';

export interface RecordGoalMovementDependencies {
  readonly goals: SavingsGoalRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * Records a deposit or a withdrawal the user says they made.
 *
 * A withdrawal informs and then stops: no second confirmation, no delay — the
 * domain refuses only what the balance cannot cover. Whether this movement
 * finished the goal is decided here, from a before/after comparison inside the
 * aggregate, so the celebration on screen follows something that happened.
 *
 * A retried request carrying the same `Idempotency-Key` answers the movement it
 * already recorded, so a double tap on a slow connection never books the
 * amount twice — which, on a balance the person is trusting us to keep, would
 * be a number that lies.
 */
export class RecordGoalMovement implements UseCase<RecordGoalMovementInput, RecordedMovementOutput> {
  constructor(private readonly dependencies: RecordGoalMovementDependencies) {}

  async execute(input: RecordGoalMovementInput): Promise<Result<RecordedMovementOutput, AppError>> {
    const amount = GoalAmount.fromCents(input.amountInCents);

    if (!amount.ok) {
      return fail(gamificationFailures.invalidField('amount.amountInCents', amount.error.code));
    }

    const goal = await this.dependencies.goals.findByIdAndUserId(
      UniqueEntityId.restore(input.goalId),
      UniqueEntityId.restore(input.userId),
    );

    if (goal === null) {
      return fail(gamificationFailures.goalNotFound());
    }

    const replayed = input.idempotencyKey === null ? null : goal.movementWithKey(input.idempotencyKey);

    if (replayed !== null) {
      return this.replay(goal, replayed, input, amount.value);
    }

    return await this.recordOn(goal, input, amount.value);
  }

  private async recordOn(
    goal: SavingsGoal,
    input: RecordGoalMovementInput,
    amount: GoalAmount,
  ): Promise<Result<RecordedMovementOutput, AppError>> {
    const recorded = goal.record({
      id: this.dependencies.idGenerator.generate(),
      direction: input.direction,
      amount,
      occurredAt: this.dependencies.clock.now(),
      idempotencyKey: input.idempotencyKey,
    });

    if (!recorded.ok) {
      return fail(gamificationFailures.insufficientBalance(goal.savedInCents()));
    }

    const saved = await this.saved(goal);

    if (!saved.ok) {
      return saved;
    }

    await this.dependencies.events.publish(goal.pullEvents());

    return ok(this.outputFor(goal, recorded.value));
  }

  private async saved(goal: SavingsGoal): Promise<Result<void, AppError>> {
    try {
      await this.dependencies.goals.save(goal);

      return ok(undefined);
    } catch (cause) {
      if (cause instanceof ConcurrentModificationError) {
        return fail(gamificationFailures.goalModifiedConcurrently());
      }

      throw cause;
    }
  }

  private replay(
    goal: SavingsGoal,
    movement: GoalMovement,
    input: RecordGoalMovementInput,
    amount: GoalAmount,
  ): Result<RecordedMovementOutput, AppError> {
    if (!movement.matches(input.direction, amount)) {
      return fail(gamificationFailures.idempotencyKeyReused());
    }

    return ok(this.outputFor(goal, movement));
  }

  private outputFor(goal: SavingsGoal, movement: GoalMovement): RecordedMovementOutput {
    return {
      goal: savingsGoalFromAggregate(goal),
      movement: movementFromAggregate(movement),
      reachedNow: movement.reachedTarget,
    };
  }
}
