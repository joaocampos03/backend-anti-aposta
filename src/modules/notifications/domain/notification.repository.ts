import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Notification } from './notification.js';

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  deleteAllForRecipient(recipientId: UniqueEntityId): Promise<void>;
  /** Drops everything older than this person's newest `capacity`. */
  retainNewest(recipientId: UniqueEntityId, capacity: number): Promise<void>;
  /** This person's newest, newest first. */
  findNewestByRecipientId(
    recipientId: UniqueEntityId,
    limit: number,
  ): Promise<readonly Notification[]>;
  /**
   * Stamps the ones still unread, so the first reading is the one that stays.
   * One set-based write: two tabs reading at once cannot overwrite each other,
   * and an id that is not this person's changes nothing.
   */
  markRead(
    recipientId: UniqueEntityId,
    notificationIds: readonly UniqueEntityId[],
    readAt: Date,
  ): Promise<void>;
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
