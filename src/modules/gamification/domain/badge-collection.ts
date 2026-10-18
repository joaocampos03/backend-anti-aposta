import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Attainment } from './badge-attainment.js';
import {
  BADGE_CATALOGUE,
  findBadgeDefinition,
  isMeasuredFamily,
  type BadgeDefinition,
  type BadgeFamily,
} from './badge-catalogue.js';
import { Badge } from './badge.js';
import { BadgesAwarded, type AwardedBadgePayload } from './events/badges-awarded.js';

interface BadgeCollectionProperties {
  readonly userId: UniqueEntityId;
  readonly badges: readonly Badge[];
  readonly createdAt: Date;
  readonly version: number;
}

/** Each family's figure as measured now; a family missing here could not be measured. */
export type FamilyAttainments = ReadonlyMap<BadgeFamily, Attainment>;

export interface AwardOccasion {
  readonly awardedAt: Date;
  /** Ids come from the caller's generator, so a badge is valid before it is stored. */
  readonly nextId: () => UniqueEntityId;
}

/**
 * The milestones one person has reached. Created empty at registration so no
 * screen has to tell "no aggregate at all" from "empty aggregate".
 *
 * **A badge is never revoked.** It records something that happened; taking it
 * back when a streak breaks or a correction lowers a figure would be a
 * punishment, and this product does not punish. The one exception is not a
 * judgement but a deletion the person asked for: revoking the Open Finance
 * consent forgets the badges derived from the statement it shared.
 */
export class BadgeCollection extends AggregateRoot {
  private badges: readonly Badge[];
  private readonly awarded: Badge[] = [];
  private readonly forgotten: string[] = [];

  private constructor(
    id: UniqueEntityId,
    private readonly properties: BadgeCollectionProperties,
  ) {
    super(id);
    this.badges = properties.badges;
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

  /**
   * Awards every badge whose family figure has reached its threshold and that is
   * not held yet, all at the same instant, and records one `BadgesAwarded` for
   * them. Idempotent: what is held is never awarded twice, so the same figures
   * evaluated again award nothing.
   */
  awardDue(attainments: FamilyAttainments, occasion: AwardOccasion): readonly Badge[] {
    const due = BADGE_CATALOGUE.filter(
      (definition) => !this.holds(definition.id) && isReached(definition, attainments),
    );

    if (due.length === 0) {
      return [];
    }

    const { awardedAt } = occasion;
    const badges = due.map((definition) =>
      Badge.award({ id: occasion.nextId(), kind: definition.id, awardedAt }),
    );
    this.badges = [...this.badges, ...badges];
    this.awarded.push(...badges);
    this.addEvent(
      new BadgesAwarded({
        userId: this.userId,
        awardedAt,
        awards: due.map((definition) => toAwardPayload(definition, attainments)),
      }),
    );

    return badges;
  }

  /** LGPD art. 18: the badges measured in a statement go with the consent that shared it. */
  forgetMeasured(): number {
    const measured = this.badges.filter((badge) => isMeasured(badge.kind));

    this.badges = this.badges.filter((badge) => !isMeasured(badge.kind));
    this.forgotten.push(...measured.map((badge) => badge.kind));

    return measured.length;
  }

  holds(kind: string): boolean {
    return this.badges.some((badge) => badge.kind === kind);
  }

  badgeOf(kind: string): Badge | null {
    return this.badges.find((badge) => badge.kind === kind) ?? null;
  }

  /** Awarded since the collection was loaded, for the repository to insert. */
  newBadges(): readonly Badge[] {
    return this.awarded;
  }

  /** Forgotten since the collection was loaded, for the repository to delete. */
  forgottenKinds(): readonly string[] {
    return this.forgotten;
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get heldBadges(): readonly Badge[] {
    return this.badges;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }

  get version(): number {
    return this.properties.version;
  }
}

function isReached(definition: BadgeDefinition, attainments: FamilyAttainments): boolean {
  const attainment = attainments.get(definition.family);

  return attainment !== undefined && attainment.value >= definition.threshold;
}

function isMeasured(kind: string): boolean {
  const definition = findBadgeDefinition(kind);

  return definition !== null && isMeasuredFamily(definition.family);
}

function toAwardPayload(definition: BadgeDefinition, attainments: FamilyAttainments): AwardedBadgePayload {
  const evidence = attainments.get(definition.family)?.evidence ?? null;
  const isLowerBound =
    evidence !== null &&
    (evidence.kind === 'CURRENT_STREAK' || evidence.kind === 'CLOSED_STREAK') &&
    evidence.startsBeforeWindow;

  return {
    badgeId: definition.id,
    family: definition.family,
    attainedValue: attainments.get(definition.family)?.value ?? 0,
    isLowerBound,
  };
}
