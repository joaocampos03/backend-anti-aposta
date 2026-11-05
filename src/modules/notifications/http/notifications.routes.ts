import { Router, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { NOTIFICATIONS_MESSAGES } from '../application/notifications.messages.js';
import type { NotificationsController } from './notifications.controller.js';

export interface NotificationsRouteDependencies {
  readonly controller: NotificationsController;
  readonly requireSession: RequestHandler;
  readonly validateRecipientParams: RequestHandler;
  readonly validateDemoNotificationBody: RequestHandler;
  readonly validateReadReceiptBody: RequestHandler;
  /**
   * The demonstration console's rate limit, or `null` where demo writes are
   * switched off — in production, always. A route that is not mounted cannot
   * be used to put words on a stranger's screen.
   */
  readonly demoRateLimits: readonly RequestHandler[] | null;
}

/**
 * The stream is read-only: it carries what already happened and is never a
 * command channel. Sending is a separate route, and only for the demo: everything
 * else is stored by `NotificationDelivery`, so no client can write to an inbox.
 */
export function notificationsRoutes(dependencies: NotificationsRouteDependencies): Router {
  const router = Router();

  router.get(
    '/notifications',
    internalErrorMessage(NOTIFICATIONS_MESSAGES.listUnavailable),
    dependencies.requireSession,
    dependencies.controller.list,
  );

  router.post(
    '/notifications/read-receipts',
    internalErrorMessage(NOTIFICATIONS_MESSAGES.readReceiptUnavailable),
    dependencies.requireSession,
    dependencies.validateReadReceiptBody,
    dependencies.controller.markRead,
  );

  router.get(
    '/notifications/stream',
    internalErrorMessage(NOTIFICATIONS_MESSAGES.streamUnavailable),
    dependencies.requireSession,
    dependencies.controller.stream,
  );

  if (dependencies.demoRateLimits !== null) {
    router.post(
      '/users/:userId/notifications',
      internalErrorMessage(NOTIFICATIONS_MESSAGES.deliveryUnavailable),
      dependencies.requireSession,
      ...dependencies.demoRateLimits,
      dependencies.validateRecipientParams,
      dependencies.validateDemoNotificationBody,
      dependencies.controller.sendDemo,
    );
  }

  return router;
}
