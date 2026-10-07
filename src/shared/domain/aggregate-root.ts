import type { DomainEvent } from './domain-event.js';
import { Entity } from './entity.js';
import type { UniqueEntityId } from './unique-entity-id.js';

export abstract class AggregateRoot extends Entity {
  private recordedEvents: DomainEvent[] = [];

  protected constructor(id: UniqueEntityId) {
    super(id);
  }

  protected addEvent(event: DomainEvent): void {
    this.recordedEvents.push(event);
  }

  /** Hands the recorded events to the caller that is about to publish them. */
  pullEvents(): readonly DomainEvent[] {
    const pulled = this.recordedEvents;
    this.recordedEvents = [];

    return pulled;
  }
}
