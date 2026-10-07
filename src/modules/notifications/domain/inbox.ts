import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

interface InboxProperties {
  readonly userId: UniqueEntityId;
  readonly createdAt: Date;
}

/**
 * Where a nudge lands when no browser is connected. It exists from registration
 * so the first real nudge never has to create it — and registration itself
 * delivers nothing: a welcome message carries no information, and the module's
 * frequency rule exists to keep notifications meaningful.
 */
export class Inbox extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: InboxProperties,
  ) {
    super(id);
  }

  static empty(input: {
    readonly id: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly createdAt: Date;
  }): Inbox {
    return new Inbox(input.id, { userId: input.userId, createdAt: input.createdAt });
  }

  static restore(id: UniqueEntityId, properties: InboxProperties): Inbox {
    return new Inbox(id, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }
}
