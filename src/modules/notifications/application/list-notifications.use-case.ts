import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { INBOX_CAPACITY, type Notification } from '../domain/notification.js';
import type { NotificationRepository } from '../domain/notification.repository.js';
import type { ListNotificationsInput, NotificationDto } from './dto/notification.dto.js';
import { toNotificationDto } from './notification-delivery.js';
import type { MovementLine, MovementReader } from './ports/movement-reader.port.js';

/**
 * What the person keeps, newest first. Capped on the read as well as on the
 * write, so rows from before the cap, or a race between two deliveries, never
 * reach the screen as a longer list.
 *
 * The movements are read here, per request and behind the session, in one query
 * for the whole inbox. A row that is gone, after a revocation, drops out of the
 * answer and the notification keeps its count.
 */
export class ListNotifications
  implements UseCase<ListNotificationsInput, readonly NotificationDto[]>
{
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly movements: MovementReader,
  ) {}

  async execute(
    input: ListNotificationsInput,
  ): Promise<Result<readonly NotificationDto[], AppError>> {
    const newest = await this.notifications.findNewestByRecipientId(
      UniqueEntityId.restore(input.userId),
      INBOX_CAPACITY,
    );

    const lines = await this.linesFor(input.userId, newest);

    return ok(
      newest.map((notification) => ({
        ...toNotificationDto(notification),
        movements: transactionIdsOf(notification).flatMap((id) => lines.get(id) ?? []),
      })),
    );
  }

  private async linesFor(
    userId: string,
    notifications: readonly Notification[],
  ): Promise<ReadonlyMap<string, MovementLine>> {
    const transactionIds = notifications.flatMap(transactionIdsOf);

    if (transactionIds.length === 0) return new Map();

    const lines = await this.movements.newestOf(userId, transactionIds, transactionIds.length);

    return new Map(lines.map((line) => [line.transactionId, line]));
  }
}

function transactionIdsOf(notification: Notification): readonly string[] {
  return notification.content.kind === 'TRANSACTIONS_INGESTED'
    ? notification.content.transactionIds
    : [];
}
