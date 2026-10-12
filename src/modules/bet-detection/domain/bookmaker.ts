import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Cnpj } from './cnpj.js';

/**
 * A betting operator, identified by its registration number. The registry is
 * data rather than code so it can grow without a deploy — and so a correction
 * undone tomorrow is judged by tomorrow's registry.
 */
export class Bookmaker extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    readonly tradeName: string,
    readonly document: Cnpj,
    readonly registeredAt: Date,
  ) {
    super(id);
  }

  static register(input: {
    readonly id: UniqueEntityId;
    readonly tradeName: string;
    readonly document: Cnpj;
    readonly registeredAt: Date;
  }): Bookmaker {
    return new Bookmaker(input.id, input.tradeName, input.document, input.registeredAt);
  }
}
