import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/** Ids only: what was ingested, for whom, and when the run finished. */
export interface TransactionsIngestedPayload {
  readonly userId: string;
  readonly transactionIds: readonly string[];
  readonly ingestedAt: string;
}

export class TransactionsIngested implements DomainEvent<TransactionsIngestedPayload> {
  static readonly NAME = 'TransactionsIngested';

  readonly name = TransactionsIngested.NAME;
  readonly occurredAt: Date;
  readonly payload: TransactionsIngestedPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly transactionIds: readonly UniqueEntityId[];
    readonly ingestedAt: Date;
  }) {
    this.occurredAt = input.ingestedAt;
    this.payload = {
      userId: input.userId.value,
      transactionIds: input.transactionIds.map((id) => id.value),
      ingestedAt: input.ingestedAt.toISOString(),
    };
  }
}
