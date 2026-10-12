import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * Revocation deletes the derived data — transactions, classifications, nudges —
 * and not merely the token. That is LGPD art. 18, and it is a use case with
 * tests rather than a manual script.
 */
export interface ConsentRevokedPayload {
  readonly userId: string;
  readonly consentId: string;
  readonly revokedAt: string;
}

export class ConsentRevoked implements DomainEvent<ConsentRevokedPayload> {
  static readonly NAME = 'ConsentRevoked';

  readonly name = ConsentRevoked.NAME;
  readonly occurredAt: Date;
  readonly payload: ConsentRevokedPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly consentId: UniqueEntityId;
    readonly revokedAt: Date;
  }) {
    this.occurredAt = input.revokedAt;
    this.payload = {
      userId: input.userId.value,
      consentId: input.consentId.value,
      revokedAt: input.revokedAt.toISOString(),
    };
  }
}
