import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { NotificationRepository } from '../domain/notification.repository.js';
import type { MarkNotificationsReadInput } from './dto/notification.dto.js';

/**
 * Names the ids the person saw instead of "everything", so one that arrived a
 * moment later stays unread. Repeating it changes nothing, and somebody else's
 * id is skipped without saying so: answering differently would confirm it exists.
 */
export class MarkNotificationsRead implements UseCase<MarkNotificationsReadInput, void> {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: MarkNotificationsReadInput): Promise<Result<void, AppError>> {
    await this.notifications.markRead(
      UniqueEntityId.restore(input.userId),
      input.notificationIds.map((id) => UniqueEntityId.restore(id)),
      this.clock.now(),
    );

    return ok(undefined);
  }
}
