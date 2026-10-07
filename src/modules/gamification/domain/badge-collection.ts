import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Badge } from './badge.js';

interface BadgeCollectionProperties {
  readonly userId: UniqueEntityId;
  readonly badges: readonly Badge[];
  readonly createdAt: Date;
  readonly version: number;
}

/**
 * Created empty at registration so no screen has to tell "no aggregate at all"
 * from "empty aggregate" — that distinction doubles every first-run branch for
 * no product benefit. Awarding badges belongs to the achievements feature.
 */
export class BadgeCollection extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: BadgeCollectionProperties,
  ) {
    super(id);
  }

  static empty(input: {
    readonly id: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly createdAt: Date;
  }): BadgeCollection {
    return new BadgeCollection(input.id, {
      userId: input.userId,
      badges: [],
      createdAt: input.createdAt,
      version: 0,
    });
  }

  static restore(id: UniqueEntityId, properties: BadgeCollectionProperties): BadgeCollection {
    return new BadgeCollection(id, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get badges(): readonly Badge[] {
    return this.properties.badges;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }

  get version(): number {
    return this.properties.version;
  }
}
