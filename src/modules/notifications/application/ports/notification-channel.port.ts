import type { NotificationDto } from '../dto/notification.dto.js';

export type NotificationListener = (notification: NotificationDto) => void;

/**
 * The live half of delivery. Today it is SSE over an in-process fan-out; a
 * WebSocket or a broker would be another adapter and nothing else would move.
 * A push reaches only the recipient's own open streams.
 */
export interface NotificationChannel {
  push(notification: NotificationDto): void;
}

/** The other end of the channel: one open stream, listening for one person. */
export interface NotificationFeed {
  /** Returns the unsubscribe, which the stream calls when the browser goes away. */
  subscribe(recipientId: string, listener: NotificationListener): () => void;
}
