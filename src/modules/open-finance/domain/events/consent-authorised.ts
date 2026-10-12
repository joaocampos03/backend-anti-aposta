import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * The person said yes at the DataHolder and the code was exchanged. Recorded
 * for audit; nothing subscribes yet. Ids only, as every payload here.
 */
export interface ConsentAuthorisedPayload {
  readonly userId: string;
  readonly consentId: string;
  readonly authorisedAt: string;
}

export class ConsentAuthorised implements DomainEvent<ConsentAuthorisedPayload> {
  static readonly NAME = 'ConsentAuthorised';

  readonly name = ConsentAuthorised.NAME;
  readonly occurredAt: Date;
  readonly payload: ConsentAuthorisedPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly consentId: UniqueEntityId;
    readonly authorisedAt: Date;
  }) {
    this.occurredAt = input.authorisedAt;
    this.payload = {
      userId: input.userId.value,
      consentId: input.consentId.value,
      authorisedAt: input.authorisedAt.toISOString(),
    };
  }
}
