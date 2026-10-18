import type { DomainEvent } from '@shared/domain/domain-event.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BadgeFamily, BadgeId } from '../badge-catalogue.js';

export interface AwardedBadgePayload {
  readonly badgeId: BadgeId;
  readonly family: BadgeFamily;
  /** The family's figure when it was awarded, so the announcement can say what was done. */
  readonly attainedValue: number;
  /** The figure ran off the edge of the statement we hold: it is the least we can claim. */
  readonly isLowerBound: boolean;
}

/**
 * One evaluation awarded one or more badges. One event per evaluation, not per
 * badge, because the celebration is an interruption and an evaluation earns at
 * most one: a first synchronisation that finds a month-long streak awards three
 * badges at once, and three modals in a row would be harassment.
 */
export interface BadgesAwardedPayload {
  readonly userId: string;
  readonly awardedAt: string;
  /** Catalogue order. */
  readonly awards: readonly AwardedBadgePayload[];
}

export class BadgesAwarded implements DomainEvent<BadgesAwardedPayload> {
  static readonly NAME = 'BadgesAwarded';

  readonly name = BadgesAwarded.NAME;
  readonly occurredAt: Date;
  readonly payload: BadgesAwardedPayload;

  constructor(input: {
    readonly userId: UniqueEntityId;
    readonly awardedAt: Date;
    readonly awards: readonly AwardedBadgePayload[];
  }) {
    this.occurredAt = input.awardedAt;
    this.payload = {
      userId: input.userId.value,
      awardedAt: input.awardedAt.toISOString(),
      awards: input.awards,
    };
  }
}
