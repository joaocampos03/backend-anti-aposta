import type { UniqueEntityId } from './unique-entity-id.js';

export abstract class Entity {
  protected constructor(readonly id: UniqueEntityId) {}

  equals(other: Entity): boolean {
    return this.id.equals(other.id);
  }
}
