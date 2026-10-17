import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { assertNever } from '@shared/domain/assert-never.js';
import type { GoalAmount } from './goal-amount.js';

/** A union rather than a boolean: `record({ isDeposit: false })` reads like nothing. */
export const MOVEMENT_DIRECTIONS = ['DEPOSIT', 'WITHDRAWAL'] as const;

export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

interface GoalMovementProperties {
  readonly id: UniqueEntityId;
  readonly direction: MovementDirection;
  readonly amount: GoalAmount;
  readonly occurredAt: Date;
  /** True on the one movement that first carried the balance past the target. */
  readonly reachedTarget: boolean;
  /** The client's retry key, stored with the result so a replay answers the same. */
  readonly idempotencyKey: string | null;
}

/**
 * One amount the user says they put aside or took back. Immutable: a movement
 * logged by mistake is answered by another movement, the way a ledger works, so
 * the history the balance is summed from never changes under the reader.
 */
export class GoalMovement {
  private constructor(private readonly properties: GoalMovementProperties) {}

  static record(properties: GoalMovementProperties): GoalMovement {
    return new GoalMovement(properties);
  }

  get id(): UniqueEntityId {
    return this.properties.id;
  }

  get direction(): MovementDirection {
    return this.properties.direction;
  }

  get amount(): GoalAmount {
    return this.properties.amount;
  }

  get occurredAt(): Date {
    return this.properties.occurredAt;
  }

  get reachedTarget(): boolean {
    return this.properties.reachedTarget;
  }

  get idempotencyKey(): string | null {
    return this.properties.idempotencyKey;
  }

  /** The sign the balance needs; the stored amount never carries one. */
  signedCents(): number {
    switch (this.direction) {
      case 'DEPOSIT':
        return this.amount.inCents;
      case 'WITHDRAWAL':
        return -this.amount.inCents;
      default:
        return assertNever(this.direction);
    }
  }

  /** Whether a replayed request asks for exactly this movement. */
  matches(direction: MovementDirection, amount: GoalAmount): boolean {
    return this.direction === direction && this.amount.equals(amount);
  }
}
