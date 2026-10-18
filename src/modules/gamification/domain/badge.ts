import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

/**
 * An awarded milestone: which one, and when it was first reached. Participation
 * is not a milestone, and nothing here is ever taken back.
 */
export class Badge {
  private constructor(
    readonly id: UniqueEntityId,
    readonly kind: string,
    readonly awardedAt: Date,
  ) {}

  static award(input: { readonly id: UniqueEntityId; readonly kind: string; readonly awardedAt: Date }): Badge {
    return new Badge(input.id, input.kind, input.awardedAt);
  }

  static restore(input: { readonly id: UniqueEntityId; readonly kind: string; readonly awardedAt: Date }): Badge {
    return new Badge(input.id, input.kind, input.awardedAt);
  }

  equals(other: Badge): boolean {
    return this.kind === other.kind;
  }
}
