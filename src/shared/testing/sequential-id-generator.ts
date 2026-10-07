import type { IdGenerator } from '../application/id-generator.port.js';
import { UniqueEntityId } from '../domain/unique-entity-id.js';

/** Predictable UUIDs, so a test can assert on an id it did not see created. */
export class SequentialIdGenerator implements IdGenerator {
  private issued = 0;

  generate(): UniqueEntityId {
    this.issued += 1;

    return UniqueEntityId.restore(
      `0192f3c1-7a1b-7c3e-9f20-${this.issued.toString().padStart(12, '0')}`,
    );
  }
}
