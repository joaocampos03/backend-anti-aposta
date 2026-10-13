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
