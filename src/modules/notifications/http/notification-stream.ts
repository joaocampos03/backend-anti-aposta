import type { Request, Response } from 'express';
import type { NotificationDto } from '../application/dto/notification.dto.js';
import type { NotificationFeed } from '../application/ports/notification-channel.port.js';
import { NotificationsPresenter } from './notifications.presenter.js';

/** Under the idle timeout of every proxy between here and the browser. */
export const HEARTBEAT_INTERVAL_IN_MILLISECONDS = 15_000;
/** How long the browser waits before reconnecting, sent once on open. */
const RECONNECT_AFTER_IN_MILLISECONDS = 3_000;

const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // nginx and its kin buffer responses unless told not to, which holds frames back.
  'X-Accel-Buffering': 'no',
} as const;

/**
 * One open stream for one person. It subscribes **before** reading what was
 * missed and holds live pushes until the replay is written, so a notification
 * delivered in between is neither lost nor shown twice.
 */
export class NotificationStream {
  private readonly held: NotificationDto[] = [];
  private readonly written = new Set<string>();
  private isLive = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly response: Response,
    feed: NotificationFeed,
    recipientId: string,
  ) {
    this.unsubscribe = feed.subscribe(recipientId, (notification) => {
      this.receive(notification);
    });
  }

  /** Answers the request and keeps it open until the browser goes away. */
  open(request: Request, replayed: readonly NotificationDto[]): void {
    this.response.writeHead(200, STREAM_HEADERS);
    this.response.write(`retry: ${String(RECONNECT_AFTER_IN_MILLISECONDS)}\n\n`);

    for (const notification of [...replayed, ...this.held]) {
      this.write(notification);
    }

    this.isLive = true;
    this.keepAliveUntilClosed(request);
  }

  close(): void {
    this.unsubscribe();
  }

  private receive(notification: NotificationDto): void {
    if (!this.isLive) {
      this.held.push(notification);

      return;
    }

    this.write(notification);
  }

  private write(notification: NotificationDto): void {
    if (this.written.has(notification.id)) {
      return;
    }

    this.written.add(notification.id);
    this.response.write(NotificationsPresenter.frame(notification));
  }

  private keepAliveUntilClosed(request: Request): void {
    const heartbeat = setInterval(() => {
      this.response.write(': heartbeat\n\n');
    }, HEARTBEAT_INTERVAL_IN_MILLISECONDS);

    request.on('close', () => {
      clearInterval(heartbeat);
      this.close();
    });
  }
}
