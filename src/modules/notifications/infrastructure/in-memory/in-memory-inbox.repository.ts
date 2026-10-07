import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Inbox } from '../../domain/inbox.js';
import type { InboxRepository } from '../../domain/inbox.repository.js';

export class InMemoryInboxRepository implements InboxRepository {
  readonly inboxes: Inbox[] = [];

  async save(inbox: Inbox): Promise<void> {
    const index = this.inboxes.findIndex((stored) => stored.userId.equals(inbox.userId));

    if (index >= 0) {
      this.inboxes.splice(index, 1, inbox);

      return;
    }

    this.inboxes.push(inbox);
  }

  async findByUserId(userId: UniqueEntityId): Promise<Inbox | null> {
    return this.inboxes.find((stored) => stored.userId.equals(userId)) ?? null;
  }
}
