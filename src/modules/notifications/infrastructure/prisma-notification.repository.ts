import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Notification } from '../domain/notification.js';
import type { NotificationRepository } from '../domain/notification.repository.js';
import { NotificationMapper } from './notification.mapper.js';

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(notification: Notification): Promise<void> {
    await this.client.notification.create({ data: NotificationMapper.toRow(notification) });
  }

  async deleteAllForRecipient(recipientId: UniqueEntityId): Promise<void> {
    await this.client.notification.deleteMany({ where: { recipientId: recipientId.value } });
  }

  /** The row at the edge of what is kept is the cut-off; with fewer than that, nothing goes. */
  async retainNewest(recipientId: UniqueEntityId, capacity: number): Promise<void> {
    const oldestKept = await this.client.notification.findFirst({
      where: { recipientId: recipientId.value },
      orderBy: { id: 'desc' },
      skip: capacity - 1,
      select: { id: true },
    });

    if (oldestKept === null) return;

    await this.client.notification.deleteMany({
      where: { recipientId: recipientId.value, id: { lt: oldestKept.id } },
    });
  }

  async findNewestByRecipientId(
    recipientId: UniqueEntityId,
    limit: number,
  ): Promise<readonly Notification[]> {
    const rows = await this.client.notification.findMany({
      where: { recipientId: recipientId.value },
      orderBy: { id: 'desc' },
      take: limit,
    });

    return rows.map((row) => NotificationMapper.toDomain(row));
  }

  async markRead(
    recipientId: UniqueEntityId,
    notificationIds: readonly UniqueEntityId[],
    readAt: Date,
  ): Promise<void> {
    await this.client.notification.updateMany({
      where: {
        recipientId: recipientId.value,
        id: { in: notificationIds.map((id) => id.value) },
        readAt: null,
      },
      data: { readAt },
    });
  }

  /** UUID v7 compares in time order, and `(recipient_id, id)` is indexed for exactly this. */
  async findByRecipientIdAfter(
    recipientId: UniqueEntityId,
    lastSeenId: UniqueEntityId,
    limit: number,
  ): Promise<readonly Notification[]> {
    const rows = await this.client.notification.findMany({
      where: { recipientId: recipientId.value, id: { gt: lastSeenId.value } },
      orderBy: { id: 'asc' },
      take: limit,
    });

    return rows.map((row) => NotificationMapper.toDomain(row));
  }
}
