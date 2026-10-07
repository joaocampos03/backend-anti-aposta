import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * Carries no name and no e-mail. No consumer needs them — `gamification`
 * bootstraps a streak at zero days and an empty badge collection,
 * `notifications` an empty inbox — so including them would be gratuitous PII
 * propagation across a context boundary.
 */
export interface UserRegisteredPayload {
  readonly userId: string;
  readonly registeredAt: string;
}

export class UserRegistered implements DomainEvent<UserRegisteredPayload> {
  static readonly NAME = 'UserRegistered';

  readonly name = UserRegistered.NAME;
  readonly occurredAt: Date;
  readonly payload: UserRegisteredPayload;

  constructor(input: { readonly userId: UniqueEntityId; readonly registeredAt: Date }) {
    this.occurredAt = input.registeredAt;
    this.payload = {
      userId: input.userId.value,
      registeredAt: input.registeredAt.toISOString(),
    };
  }
}
