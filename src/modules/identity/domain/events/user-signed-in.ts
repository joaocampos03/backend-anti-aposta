import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * Recorded for audit; nothing consumes it today. It carries no e-mail and no
 * name, and **no notification is ever sent for a sign-in**: a "novo acesso à sua
 * conta" push is a banking pattern that, in a product whose notifications are
 * about gambling, puts an alarming message on a lock screen for a routine event.
 */
export interface UserSignedInPayload {
  readonly userId: string;
  readonly sessionId: string;
  readonly signedInAt: string;
}

export class UserSignedIn implements DomainEvent<UserSignedInPayload> {
  static readonly NAME = 'UserSignedIn';

  readonly name = UserSignedIn.NAME;
  readonly occurredAt: Date;
  readonly payload: UserSignedInPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly sessionId: UniqueEntityId;
    readonly signedInAt: Date;
  }) {
    this.occurredAt = input.signedInAt;
    this.payload = {
      userId: input.userId.value,
      sessionId: input.sessionId.value,
      signedInAt: input.signedInAt.toISOString(),
    };
  }
}
