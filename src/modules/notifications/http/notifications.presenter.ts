import type { NotificationDto } from '../application/dto/notification.dto.js';

/**
 * The wire shape, the same on the stream and in a JSON response: the kind's
 * fields flattened beside the id and the instant, keys camelCase, amounts in
 * cents. The recipient is not repeated — it is always whoever is listening.
 */
export class NotificationsPresenter {
  static notification(notification: NotificationDto): Record<string, unknown> {
    return {
      id: notification.id,
      createdAt: notification.createdAt,
      ...notification.content,
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
