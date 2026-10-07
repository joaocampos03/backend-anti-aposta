import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * The credential behind every session of this user changed, which is why the
 * reset revokes all of them. The payload carries no address and no password.
 */
export interface PasswordChangedPayload {
  readonly userId: string;
  readonly changedAt: string;
}

export class PasswordChanged implements DomainEvent<PasswordChangedPayload> {
  static readonly NAME = 'PasswordChanged';

  readonly name = PasswordChanged.NAME;
  readonly occurredAt: Date;
  readonly payload: PasswordChangedPayload;

  constructor(input: { readonly userId: UniqueEntityId; readonly changedAt: Date }) {
    this.occurredAt = input.changedAt;
    this.payload = { userId: input.userId.value, changedAt: input.changedAt.toISOString() };
  }
}
