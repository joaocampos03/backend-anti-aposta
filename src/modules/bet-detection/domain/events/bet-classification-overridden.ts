import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

export type OverrideVerdict = 'NOT_A_BET';

/**
 * What makes a correction honest: everything derived from the classification
 * has to recompute when this fires — the hero figure, the monthly bands, the
 * bookmaker ranking, the streak, the goal ceiling and the support offer. An
 * override that changed one screen would leave somebody looking at a number
 * they have already corrected.
 *
 * Ids only. The free-text reason the person typed is never carried here, never
 * shown to anybody else and never logged.
 */
export interface BetClassificationOverriddenPayload {
  readonly userId: string;
  readonly transactionId: string;
  readonly verdict: OverrideVerdict | 'REVERTED';
  readonly overriddenAt: string;
}

export class BetClassificationOverridden
  implements DomainEvent<BetClassificationOverriddenPayload>
{
  static readonly NAME = 'BetClassificationOverridden';

  readonly name = BetClassificationOverridden.NAME;
  readonly occurredAt: Date;
  readonly payload: BetClassificationOverriddenPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly transactionId: UniqueEntityId;
    readonly verdict: OverrideVerdict | 'REVERTED';
    readonly overriddenAt: Date;
  }) {
    this.occurredAt = input.overriddenAt;
    this.payload = {
      userId: input.userId.value,
      transactionId: input.transactionId.value,
      verdict: input.verdict,
      overriddenAt: input.overriddenAt.toISOString(),
    };
  }
}
