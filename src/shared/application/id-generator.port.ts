import type { UniqueEntityId } from '../domain/unique-entity-id.js';

export interface IdGenerator {
  generate(): UniqueEntityId;
}
