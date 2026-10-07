import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/** Recorded for audit, once per actual revocation. */
export interface UserSignedOutPayload {
  readonly userId: string;
  readonly sessionId: string;
  readonly signedOutAt: string;
}

export class UserSignedOut implements DomainEvent<UserSignedOutPayload> {
  static readonly NAME = 'UserSignedOut';

  readonly name = UserSignedOut.NAME;
  readonly occurredAt: Date;
  readonly payload: UserSignedOutPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly sessionId: UniqueEntityId;
    readonly signedOutAt: Date;
  }) {
    this.occurredAt = input.signedOutAt;
    this.payload = {
      userId: input.userId.value,
      sessionId: input.sessionId.value,
      signedOutAt: input.signedOutAt.toISOString(),
    };
  }
}
