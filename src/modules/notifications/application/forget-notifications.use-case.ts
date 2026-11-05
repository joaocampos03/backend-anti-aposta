import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { InboxRepository } from '../domain/inbox.repository.js';
import type { NotificationRepository } from '../domain/notification.repository.js';

export interface ForgetNotificationsInput {
  readonly userId: string;
}

/** The end of an account: the inbox and everything in it. Idempotent. */
export class ForgetNotifications implements UseCase<ForgetNotificationsInput, void> {
  constructor(
    private readonly inboxes: InboxRepository,
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(input: ForgetNotificationsInput): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);

    await this.notifications.deleteAllForRecipient(userId);
    await this.inboxes.deleteByUserId(userId);

    return ok(undefined);
  }
}
