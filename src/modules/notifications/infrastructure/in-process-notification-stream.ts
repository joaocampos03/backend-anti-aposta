import type { NotificationDto } from '../application/dto/notification.dto.js';
import type {
  NotificationChannel,
  NotificationFeed,
  NotificationListener,
} from '../application/ports/notification-channel.port.js';

/**
 * The fan-out behind the SSE endpoint: each open stream registers under its
 * own user id, and a push reaches that user's streams and nobody else's.
 *
 * It lives in this process, so it does not cross instances. That is enough for
 * one API process; more than one would need a broker behind this same port,
 * which the inbox makes safe to add — nothing is lost while it is missing.
 */
export class InProcessNotificationStream implements NotificationChannel, NotificationFeed {
  private readonly listeners = new Map<string, Set<NotificationListener>>();

  push(notification: NotificationDto): void {
    for (const listener of this.listeners.get(notification.recipientId) ?? []) {
      listener(notification);
    }
  }

  subscribe(recipientId: string, listener: NotificationListener): () => void {
    const listeners = this.listeners.get(recipientId) ?? new Set<NotificationListener>();
    listeners.add(listener);
    this.listeners.set(recipientId, listeners);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.listeners.delete(recipientId);
      }
    };
  }
}
