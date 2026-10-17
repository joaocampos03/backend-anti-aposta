import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * The user chose a ceiling, effective from a month. Recorded for audit; the
 * month's outcome is measured on read, so nothing has to react to this for a
 * figure to be right.
 */
export interface BettingCeilingSetPayload {
  readonly userId: string;
  readonly ceilingId: string;
  readonly effectiveFromMonthKey: string;
  readonly setAt: string;
}

export class BettingCeilingSet implements DomainEvent<BettingCeilingSetPayload> {
  static readonly NAME = 'BettingCeilingSet';

  readonly name = BettingCeilingSet.NAME;
  readonly occurredAt: Date;
  readonly payload: BettingCeilingSetPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly ceilingId: UniqueEntityId;
    readonly effectiveFromMonthKey: string;
    readonly setAt: Date;
  }) {
    this.occurredAt = input.setAt;
    this.payload = {
      userId: input.userId.value,
      ceilingId: input.ceilingId.value,
      effectiveFromMonthKey: input.effectiveFromMonthKey,
      setAt: input.setAt.toISOString(),
    };
  }
}
