import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { InboxRepository } from '../domain/inbox.repository.js';
import type { NotificationContent } from '../domain/notification-content.js';
import { Notification } from '../domain/notification.js';
import type { NotificationRepository } from '../domain/notification.repository.js';
import type { NotificationDto } from './dto/notification.dto.js';
import { notificationsFailures } from './notifications.failures.js';
import type { NotificationChannel } from './ports/notification-channel.port.js';

export interface NotificationDeliveryDependencies {
  readonly inboxes: InboxRepository;
  readonly notifications: NotificationRepository;
  readonly channel: NotificationChannel;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * Stores first, pushes second. A push nobody is connected to receive is not a
 * lost notification: it is in the inbox, and a stream that reconnects with
 * `Last-Event-ID` is handed it then.
 *
 * Shared by every use case that tells somebody something, so none of them
 * calls another.
 */
export class NotificationDelivery {
  constructor(private readonly dependencies: NotificationDeliveryDependencies) {}

  async deliver(
    recipientId: string,
    content: NotificationContent,
  ): Promise<Result<NotificationDto, AppError>> {
    const recipient = UniqueEntityId.restore(recipientId);
    const inbox = await this.dependencies.inboxes.findByUserId(recipient);

    if (inbox === null) {
      return fail(notificationsFailures.recipientNotFound());
    }

    const composed = Notification.compose({
      id: this.dependencies.idGenerator.generate(),
      recipientId: recipient,
      content,
      createdAt: this.dependencies.clock.now(),
    });

    if (!composed.ok) {
      return fail(notificationsFailures.fromDomain(composed.error));
    }

    await this.dependencies.notifications.save(composed.value);

    const delivered = toNotificationDto(composed.value);
    this.dependencies.channel.push(delivered);

    return ok(delivered);
  }
}

export function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id.value,
    recipientId: notification.recipientId.value,
    createdAt: notification.createdAt.toISOString(),
    content: notification.content,
  };
}
