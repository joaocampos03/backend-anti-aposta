import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Inbox } from './inbox.js';

export interface InboxRepository {
  save(inbox: Inbox): Promise<void>;
  findByUserId(userId: UniqueEntityId): Promise<Inbox | null>;
}
