import type { DomainEvent } from '../domain/domain-event.js';

/** Publishing happens after the owning transaction commits. */
export interface EventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>;
}
