import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Result } from '@shared/domain/result.js';
import type { NotificationContent } from '../domain/notification-content.js';
import type {
  DemoNotificationDraft,
  NotificationDto,
  SendDemoNotificationInput,
} from './dto/notification.dto.js';
import type { NotificationDelivery } from './notification-delivery.js';
import type { YieldCalculator } from './ports/yield-calculator.port.js';

/**
 * The demonstration console: sends one notification to one person, by id, the
 * way the detection and gamification flows will once they emit their own. The
 * route exists only where the sandbox's demo writes are switched on.
 *
 * A nudge's yield is reframed here by `awareness` rather than typed into the
 * console, so what the demo shows is the figure the product would show.
 */
export class SendDemoNotification implements UseCase<SendDemoNotificationInput, NotificationDto> {
  constructor(
    private readonly delivery: NotificationDelivery,
    private readonly yields: YieldCalculator,
  ) {}

  async execute(input: SendDemoNotificationInput): Promise<Result<NotificationDto, AppError>> {
    return this.delivery.deliver(input.recipientId, this.complete(input.draft));
  }

  private complete(draft: DemoNotificationDraft): NotificationContent {
    if (draft.kind !== 'AWARENESS_NUDGE') {
      return draft;
    }

    const reframed = this.yields.reframe(draft.amountInCents);

    return {
      ...draft,
      yieldInCents: reframed.futureValueInCents,
      annualRatePercent: reframed.annualRatePercent,
    };
  }
}
