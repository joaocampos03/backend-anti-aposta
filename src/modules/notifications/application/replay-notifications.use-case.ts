import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { NotificationRepository } from '../domain/notification.repository.js';
import type { NotificationDto, ReplayNotificationsInput } from './dto/notification.dto.js';
import { toNotificationDto } from './notification-delivery.js';

/**
 * Enough to cover a dropped connection; a backlog beyond this is an inbox to
 * read, not a burst of modals to open one after another.
 */
export const REPLAY_LIMIT = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a reconnecting stream missed. Only a reconnection replays: a fresh
 * connection has no `Last-Event-ID`, and opening the app must not re-open every
 * nudge somebody already dismissed. An id that is not one of ours replays
 * nothing rather than failing the stream.
 */
export class ReplayNotifications
  implements UseCase<ReplayNotificationsInput, readonly NotificationDto[]>
{
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    input: ReplayNotificationsInput,
  ): Promise<Result<readonly NotificationDto[], AppError>> {
    if (input.lastSeenId === null || !UUID_PATTERN.test(input.lastSeenId)) {
      return ok([]);
    }

    const missed = await this.notifications.findByRecipientIdAfter(
      UniqueEntityId.restore(input.userId),
      UniqueEntityId.restore(input.lastSeenId),
      REPLAY_LIMIT,
    );

    return ok(missed.map(toNotificationDto));
  }
}
