import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Notification } from './notification.js';

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  /**
   * What reached this person after the one they last saw, oldest first. Ids are
   * UUID v7, so "after" is "later"; another person's id finds nothing.
   */
  findByRecipientIdAfter(
    recipientId: UniqueEntityId,
    lastSeenId: UniqueEntityId,
    limit: number,
  ): Promise<readonly Notification[]>;
}
