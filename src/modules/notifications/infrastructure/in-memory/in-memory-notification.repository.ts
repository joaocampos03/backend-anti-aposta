import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Notification } from '../../domain/notification.js';
import type { NotificationRepository } from '../../domain/notification.repository.js';

export class InMemoryNotificationRepository implements NotificationRepository {
  notifications: Notification[] = [];

  async save(notification: Notification): Promise<void> {
    this.notifications.push(notification);
  }

  async deleteAllForRecipient(recipientId: UniqueEntityId): Promise<void> {
    this.notifications = this.notifications.filter(
      (notification) => !notification.recipientId.equals(recipientId),
    );
  }

  async retainNewest(recipientId: UniqueEntityId, capacity: number): Promise<void> {
    const kept = new Set(this.newestOf(recipientId).slice(0, capacity));

    this.notifications = this.notifications.filter(
      (notification) => !notification.recipientId.equals(recipientId) || kept.has(notification),
    );
  }

  async findNewestByRecipientId(
    recipientId: UniqueEntityId,
    limit: number,
  ): Promise<readonly Notification[]> {
    return this.newestOf(recipientId).slice(0, limit);
  }

  async markRead(
    recipientId: UniqueEntityId,
    notificationIds: readonly UniqueEntityId[],
    readAt: Date,
  ): Promise<void> {
    this.notifications = this.notifications.map((notification) => {
      const isTarget =
        notification.recipientId.equals(recipientId) &&
        notification.readAt === null &&
        notificationIds.some((id) => id.equals(notification.id));

      return isTarget
        ? Notification.restore(notification.id, {
            recipientId: notification.recipientId,
            content: notification.content,
            createdAt: notification.createdAt,
            readAt,
          })
        : notification;
    });
  }

  private newestOf(recipientId: UniqueEntityId): readonly Notification[] {
    return this.notifications
      .filter((notification) => notification.recipientId.equals(recipientId))
      .sort((left, right) => right.id.value.localeCompare(left.id.value));
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
