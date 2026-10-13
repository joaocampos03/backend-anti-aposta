import type { RequestHandler } from 'express';
import { callerOf } from '@shared/http/require-session.js';
import type { ValidatedBody, ValidatedInput } from '@shared/http/validate.js';
import type { NotificationFeed } from '../application/ports/notification-channel.port.js';
import type { ReplayNotifications } from '../application/replay-notifications.use-case.js';
import type { SendDemoNotification } from '../application/send-demo-notification.use-case.js';
import { NotificationStream } from './notification-stream.js';
import { NotificationsPresenter } from './notifications.presenter.js';
import type { DemoNotificationBody, RecipientParams } from './notifications.schemas.js';

const CREATED = 201;

export interface NotificationsUseCases {
  readonly replayNotifications: ReplayNotifications;
  readonly sendDemoNotification: SendDemoNotification;
}

export interface NotificationsInputs {
  readonly recipientParams: ValidatedInput<RecipientParams>;
  readonly demoNotificationBody: ValidatedBody<DemoNotificationBody>;
}

export class NotificationsController {
  constructor(
    private readonly useCases: NotificationsUseCases,
    private readonly inputs: NotificationsInputs,
    private readonly feed: NotificationFeed,
  ) {}

  /** `GET /notifications/stream`: the caller's own notifications, and nobody else's. */
  readonly stream: RequestHandler = async (request, response, next) => {
    const userId = callerOf(response);
    const stream = new NotificationStream(response, this.feed, userId);

    const replayed = await this.useCases.replayNotifications
      .execute({ userId, lastSeenId: request.get('last-event-id') ?? null })
      .catch((cause: unknown) => {
        stream.close();
        throw cause;
      });

    if (!replayed.ok) {
      stream.close();
      next(replayed.error);

      return;
    }

    stream.open(request, replayed.value);
  };

  /** `POST /users/{userId}/notifications`: the demonstration console. */
  readonly sendDemo: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.sendDemoNotification.execute({
      recipientId: this.inputs.recipientParams.read(request).userId,
      draft: this.inputs.demoNotificationBody.read(request),
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(CREATED).json(NotificationsPresenter.notification(result.value));
  };
}
