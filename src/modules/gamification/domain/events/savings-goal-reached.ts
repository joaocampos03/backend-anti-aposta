import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * The balance crossed the target for the first time. Recorded once per goal,
 * ever: drawing the goal down and filling it again is not a second milestone.
 *
 * Ids only. No amount travels: the figure is self-reported, and whatever reacts
 * to this — a badge — must not lend it a certainty it has not got.
 */
export interface SavingsGoalReachedPayload {
  readonly userId: string;
  readonly goalId: string;
  readonly reachedAt: string;
}

export class SavingsGoalReached implements DomainEvent<SavingsGoalReachedPayload> {
  static readonly NAME = 'SavingsGoalReached';

  readonly name = SavingsGoalReached.NAME;
  readonly occurredAt: Date;
  readonly payload: SavingsGoalReachedPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly goalId: UniqueEntityId;
    readonly reachedAt: Date;
  }) {
    this.occurredAt = input.reachedAt;
    this.payload = {
      userId: input.userId.value,
      goalId: input.goalId.value,
      reachedAt: input.reachedAt.toISOString(),
    };
  }
}
