import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { DetectionConfidence, DetectionReason } from '../bet-classification.js';

/**
 * Ids, the reason and the confidence — no counterparty, no amount and above all
 * no description. Downstream contexts that need an amount read it from
 * `open-finance`; propagating it here would copy financial data across a
 * boundary for the convenience of one subscriber.
 */
export interface BetTransactionDetectedPayload {
  readonly userId: string;
  readonly transactionId: string;
  readonly matchedBy: DetectionReason;
  readonly confidence: DetectionConfidence;
  readonly detectedAt: string;
}

export class BetTransactionDetected implements DomainEvent<BetTransactionDetectedPayload> {
  static readonly NAME = 'BetTransactionDetected';

  readonly name = BetTransactionDetected.NAME;
  readonly occurredAt: Date;
  readonly payload: BetTransactionDetectedPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly transactionId: UniqueEntityId;
    readonly matchedBy: DetectionReason;
    readonly confidence: DetectionConfidence;
    readonly detectedAt: Date;
  }) {
    this.occurredAt = input.detectedAt;
    this.payload = {
      userId: input.userId.value,
      transactionId: input.transactionId.value,
      matchedBy: input.matchedBy,
      confidence: input.confidence,
      detectedAt: input.detectedAt.toISOString(),
    };
  }
}
