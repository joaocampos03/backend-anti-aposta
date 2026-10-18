import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { BadgeCollection } from '../domain/badge-collection.js';
import { BettingCeiling } from '../domain/betting-ceiling.js';
import { CeilingAmount } from '../domain/ceiling-amount.js';
import { CeilingDestination } from '../domain/ceiling-destination.js';
import { GoalAmount } from '../domain/goal-amount.js';
import type { MovementDirection } from '../domain/goal-movement.js';
import { GoalTitle } from '../domain/goal-title.js';
import { SavingsGoal } from '../domain/savings-goal.js';

export const USER_ID = '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77';
export const CREATED_AT = new Date('2026-10-03T13:04:11.182Z');

const ids = new SequentialIdGenerator();

interface SavingsGoalBuilder {
  withMovement(direction: MovementDirection, amountInCents: number): SavingsGoalBuilder;
  build(): SavingsGoal;
}

/** `aSavingsGoal(300_000).withMovement('DEPOSIT', 50_000).build()` */
export function aSavingsGoal(targetInCents: number): SavingsGoalBuilder {
  const movements: { direction: MovementDirection; amountInCents: number }[] = [];

  const builder: SavingsGoalBuilder = {
    withMovement(direction, amountInCents) {
      movements.push({ direction, amountInCents });

      return builder;
    },
    build() {
      const goal = SavingsGoal.create({
        id: ids.generate(),
        userId: UniqueEntityId.restore(USER_ID),
        title: GoalTitle.restore('Reserva para imprevistos'),
        purpose: 'EMERGENCY_FUND',
        target: GoalAmount.restore(targetInCents),
        createdAt: CREATED_AT,
      });

      for (const movement of movements) {
        goal.record({
          id: ids.generate(),
          direction: movement.direction,
          amount: GoalAmount.restore(movement.amountInCents),
          occurredAt: CREATED_AT,
          idempotencyKey: null,
        });
      }

      goal.pullEvents();

      return goal;
    },
  };

  return builder;
}

export function anEmptyCeiling(): BettingCeiling {
  return BettingCeiling.open({
    id: ids.generate(),
    userId: UniqueEntityId.restore(USER_ID),
    createdAt: CREATED_AT,
  });
}

export interface ChoiceInMonth {
  readonly amountInCents: number;
  readonly destination?: string;
  readonly currentMonth: string;
  readonly nextMonth: string;
}

/** Chooses a ceiling as the person would, in the month given. */
export function chooseCeiling(ceiling: BettingCeiling, choice: ChoiceInMonth): string {
  return ceiling.choose({
    termId: ids.generate(),
    amount: CeilingAmount.restore(choice.amountInCents),
    destination: CeilingDestination.restore(choice.destination ?? null),
    setAt: CREATED_AT,
    currentMonth: choice.currentMonth,
    nextMonth: choice.nextMonth,
  });
}

export function anEmptyBadgeCollection(): BadgeCollection {
  return BadgeCollection.empty({
    id: ids.generate(),
    userId: UniqueEntityId.restore(USER_ID),
    createdAt: CREATED_AT,
  });
}
