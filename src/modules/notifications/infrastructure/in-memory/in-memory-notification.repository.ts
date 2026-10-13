import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Notification } from '../../domain/notification.js';
import type { NotificationRepository } from '../../domain/notification.repository.js';

export class InMemoryNotificationRepository implements NotificationRepository {
  readonly notifications: Notification[] = [];

  async save(notification: Notification): Promise<void> {
    this.notifications.push(notification);
  }

  async findByRecipientIdAfter(
    recipientId: UniqueEntityId,
    lastSeenId: UniqueEntityId,
    limit: number,
  ): Promise<readonly Notification[]> {
    return this.notifications
      .filter(
        (notification) =>
          notification.recipientId.equals(recipientId) && notification.id.value > lastSeenId.value,
      )
      .sort((left, right) => left.id.value.localeCompare(right.id.value))
      .slice(0, limit);
  }
}
