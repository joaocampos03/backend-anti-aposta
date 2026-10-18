import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Result } from '@shared/domain/result.js';
import type { AnnounceAwardedBadgeInput, NotificationDto } from './dto/notification.dto.js';
import type { NotificationDelivery } from './notification-delivery.js';

/**
 * Reaction to `gamification.BadgesAwarded`: the one interruption an evaluation
 * is allowed. The frontend opens it as a modal with a celebration, which is why
 * it fires on the award and never on a visit to the screen that lists badges.
 */
export class AnnounceAwardedBadge implements UseCase<AnnounceAwardedBadgeInput, NotificationDto> {
  constructor(private readonly delivery: NotificationDelivery) {}

  async execute(input: AnnounceAwardedBadgeInput): Promise<Result<NotificationDto, AppError>> {
    return this.delivery.deliver(input.userId, {
      kind: 'BADGE_AWARDED',
      badgeId: input.badgeId,
      title: input.title,
      description: input.description,
    });
  }
}
