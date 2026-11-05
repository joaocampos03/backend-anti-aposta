import type { NotificationDto } from '../application/dto/notification.dto.js';
import type { NotificationContent } from '../domain/notification-content.js';

/**
 * The wire shape, the same on the stream and in a JSON response: the kind's
 * fields flattened beside the id and the instant, keys camelCase, amounts in
 * cents. The recipient is not repeated — it is always whoever is listening. A
 * `TRANSACTIONS_INGESTED` swaps its stored ids for `movements`, which only the
 * list fills in.
 */
export class NotificationsPresenter {
  static notification(notification: NotificationDto): Record<string, unknown> {
    return {
      id: notification.id,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      ...wireContent(notification.content, notification.movements),
    };
  }

  /** The whole inbox fits in one answer, so there is never a next page. */
  static list(notifications: readonly NotificationDto[]): Record<string, unknown> {
    return {
      items: notifications.map((item) => NotificationsPresenter.notification(item)),
      nextCursor: null,
    };
  }

  /**
   * One SSE frame. The event is named after the kind, and `id:` is what the
   * browser sends back as `Last-Event-ID` when it reconnects. JSON never
   * contains a raw newline, so `data:` is always a single line.
   */
  static frame(notification: NotificationDto): string {
    const data = JSON.stringify(NotificationsPresenter.notification(notification));

    return `id: ${notification.id}\nevent: ${notification.content.kind}\ndata: ${data}\n\n`;
  }
}

function wireContent(
  content: NotificationContent,
  movements: NotificationDto['movements'],
): Record<string, unknown> {
  if (content.kind !== 'TRANSACTIONS_INGESTED') return { ...content };

  return { kind: content.kind, ingestedCount: content.ingestedCount, movements };
}
