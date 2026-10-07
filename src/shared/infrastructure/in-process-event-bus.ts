import type { EventPublisher } from '../application/event-publisher.port.js';
import type { DomainEvent } from '../domain/domain-event.js';
import type { Logger } from './logger.js';

export type EventSubscriber = (event: DomainEvent) => Promise<void>;

/**
 * The in-process bus of a modular monolith: contexts talk through it instead of
 * importing each other. A subscriber is idempotent, so the same event delivered
 * twice produces the same state, and one failing subscriber never rolls back the
 * transaction that already committed — it is logged and the others still run.
 */
export class InProcessEventBus implements EventPublisher {
  private readonly subscribers = new Map<string, EventSubscriber[]>();

  constructor(private readonly logger: Logger) {}

  subscribe(eventName: string, subscriber: EventSubscriber): void {
    const existing = this.subscribers.get(eventName) ?? [];
    this.subscribers.set(eventName, [...existing, subscriber]);
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.deliver(event);
    }
  }

  private async deliver(event: DomainEvent): Promise<void> {
    const subscribers = this.subscribers.get(event.name) ?? [];

    for (const subscriber of subscribers) {
      try {
        await subscriber(event);
      } catch (cause) {
        this.logger.error(
          { event: event.name, cause: cause instanceof Error ? cause.message : 'unknown' },
          'event subscriber failed',
        );
      }
    }
  }
}
