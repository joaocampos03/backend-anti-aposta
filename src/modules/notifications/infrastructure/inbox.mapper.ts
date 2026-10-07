import type { Inbox as InboxRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Inbox } from '../domain/inbox.js';

export class InboxMapper {
  static toDomain(row: InboxRow): Inbox {
    return Inbox.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      createdAt: row.createdAt,
    });
  }

  static toRow(inbox: Inbox): InboxRow {
    return {
      id: inbox.id.value,
      userId: inbox.userId.value,
      createdAt: inbox.createdAt,
    };
  }
}
