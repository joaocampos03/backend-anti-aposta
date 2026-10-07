import type { EventPublisher } from '../application/event-publisher.port.js';
import type { DomainEvent } from '../domain/domain-event.js';

export class RecordingEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  async publish(events: readonly DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }
}
