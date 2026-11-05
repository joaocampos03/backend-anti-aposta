import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

export interface AccountDeletedPayload {
  readonly userId: string;
  readonly deletedAt: string;
}

export class AccountDeleted implements DomainEvent<AccountDeletedPayload> {
  static readonly NAME = 'AccountDeleted';

  readonly name = AccountDeleted.NAME;
  readonly occurredAt: Date;
  readonly payload: AccountDeletedPayload;

  constructor(input: { readonly userId: UniqueEntityId; readonly deletedAt: Date }) {
    this.occurredAt = input.deletedAt;
    this.payload = { userId: input.userId.value, deletedAt: input.deletedAt.toISOString() };
  }
}
