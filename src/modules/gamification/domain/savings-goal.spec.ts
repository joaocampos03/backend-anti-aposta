import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { aSavingsGoal, CREATED_AT } from '../testing/gamification.builders.js';
import { SavingsGoalReached } from './events/savings-goal-reached.js';
import { GoalAmount, MAXIMUM_GOAL_AMOUNT_IN_CENTS } from './goal-amount.js';
import type { MovementDirection } from './goal-movement.js';
import { GoalTitle } from './goal-title.js';
import type { SavingsGoal } from './savings-goal.js';

const MOVEMENT_ID = '0192f3c1-7a1b-7c3e-9f20-ffffffffffff';

function record(goal: SavingsGoal, direction: MovementDirection, amountInCents: number) {
  return goal.record({
    id: UniqueEntityId.restore(MOVEMENT_ID),
    direction,
    amount: GoalAmount.restore(amountInCents),
    occurredAt: CREATED_AT,
    idempotencyKey: null,
  });
}

describe('SavingsGoal', () => {
  describe('the withdrawal invariant', () => {
    it('refuses a withdrawal larger than the balance', () => {
      const goal = aSavingsGoal(300_000).withMovement('DEPOSIT', 50_000).build();

      const recorded = record(goal, 'WITHDRAWAL', 50_001);

      expect(recorded.ok).toBe(false);
      expect(recorded.ok ? null : recorded.error.code).toBe('INSUFFICIENT_BALANCE');
      expect(goal.savedInCents()).toBe(50_000);
    });

    it('refuses any withdrawal from an empty goal', () => {
      const goal = aSavingsGoal(300_000).build();

      expect(record(goal, 'WITHDRAWAL', 1).ok).toBe(false);
    });

    it('allows withdrawing exactly the balance, leaving zero', () => {
      const goal = aSavingsGoal(300_000).withMovement('DEPOSIT', 50_000).build();

      expect(record(goal, 'WITHDRAWAL', 50_000).ok).toBe(true);
      expect(goal.savedInCents()).toBe(0);
    });
  });

  it('sums the balance from the movements', () => {
    const goal = aSavingsGoal(300_000)
      .withMovement('DEPOSIT', 50_000)
      .withMovement('DEPOSIT', 50_000)
      .withMovement('DEPOSIT', 30_000)
      .withMovement('WITHDRAWAL', 20_000)
      .build();

    expect(goal.savedInCents()).toBe(110_000);
    expect(goal.movementCount).toBe(4);
  });

  describe('reaching the target', () => {
    it('does not mark a deposit that stops short of the target', () => {
      const goal = aSavingsGoal(100_000).withMovement('DEPOSIT', 89_000).build();

      const recorded = record(goal, 'DEPOSIT', 1_000);

      expect(recorded.ok && recorded.value.reachedTarget).toBe(false);
      expect(goal.pullEvents()).toEqual([]);
    });

    it('marks the deposit that crosses the target and records the event once', () => {
      const goal = aSavingsGoal(100_000).withMovement('DEPOSIT', 90_000).build();

      const recorded = record(goal, 'DEPOSIT', 10_000);

      expect(recorded.ok && recorded.value.reachedTarget).toBe(true);
      expect(goal.firstReachedAt).toEqual(CREATED_AT);
      expect(goal.pullEvents().map((event) => event.name)).toEqual([SavingsGoalReached.NAME]);
    });

    it('does not mark a deposit into a goal already reached', () => {
      const goal = aSavingsGoal(100_000).withMovement('DEPOSIT', 100_000).build();

      const recorded = record(goal, 'DEPOSIT', 5_000);

      expect(recorded.ok && recorded.value.reachedTarget).toBe(false);
      expect(goal.pullEvents()).toEqual([]);
    });

    it('does not celebrate twice after a goal is drawn down and filled again', () => {
      const goal = aSavingsGoal(100_000)
        .withMovement('DEPOSIT', 100_000)
        .withMovement('WITHDRAWAL', 30_000)
        .build();

      const recorded = record(goal, 'DEPOSIT', 30_000);

      expect(recorded.ok && recorded.value.reachedTarget).toBe(false);
      expect(goal.progress().isReached).toBe(true);
    });

    it('keeps the first reached date when a withdrawal takes it below the target', () => {
      const goal = aSavingsGoal(100_000).withMovement('DEPOSIT', 100_000).build();

      record(goal, 'WITHDRAWAL', 1_000);

      expect(goal.progress().isReached).toBe(false);
      expect(goal.firstReachedAt).toEqual(CREATED_AT);
    });
  });

  it('reports uncapped progress and a remainder floored at zero', () => {
    const goal = aSavingsGoal(100_000).withMovement('DEPOSIT', 125_000).build();

    expect(goal.progress().percent).toBe(125);
    expect(goal.progress().remainingInCents).toBe(0);
  });

  it('finds the movement an earlier request recorded under the same key', () => {
    const goal = aSavingsGoal(100_000).build();
    goal.record({
      id: UniqueEntityId.restore(MOVEMENT_ID),
      direction: 'DEPOSIT',
      amount: GoalAmount.restore(10_000),
      occurredAt: CREATED_AT,
      idempotencyKey: 'retry-key-1',
    });

    expect(goal.movementWithKey('retry-key-1')?.id.value).toBe(MOVEMENT_ID);
    expect(goal.movementWithKey('another-key')).toBeNull();
  });
});

describe('GoalAmount', () => {
  it('refuses zero, a negative, a fraction of a cent and anything past the cap', () => {
    expect(GoalAmount.fromCents(0).ok).toBe(false);
    expect(GoalAmount.fromCents(-100).ok).toBe(false);
    expect(GoalAmount.fromCents(10.5).ok).toBe(false);
    expect(GoalAmount.fromCents(MAXIMUM_GOAL_AMOUNT_IN_CENTS + 1).ok).toBe(false);
  });

  it('accepts the cap itself', () => {
    expect(GoalAmount.fromCents(MAXIMUM_GOAL_AMOUNT_IN_CENTS).ok).toBe(true);
  });
});

describe('GoalTitle', () => {
  it('refuses a title shorter than three letters once trimmed', () => {
    expect(GoalTitle.create('  ab  ').ok).toBe(false);
  });

  it('refuses a title past sixty characters', () => {
    expect(GoalTitle.create('a'.repeat(61)).ok).toBe(false);
  });

  it('stores the title trimmed', () => {
    const title = GoalTitle.create('  Curso técnico ');

    expect(title.ok && title.value.value).toBe('Curso técnico');
  });
});
