import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

interface StreakProperties {
  readonly userId: UniqueEntityId;
  readonly currentDays: number;
  readonly longestDays: number;
  readonly startedAt: Date;
  readonly version: number;
}

/**
 * Consecutive bet-free days. It starts at **zero** days, never at day one: the
 * product must not award a day somebody has not lived through, and a streak that
 * congratulates on sign-up is a participation trophy, not a milestone.
 */
export class Streak extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: StreakProperties,
  ) {
    super(id);
  }

  static start(input: {
    readonly id: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly startedAt: Date;
  }): Streak {
    return new Streak(input.id, {
      userId: input.userId,
      currentDays: 0,
      longestDays: 0,
      startedAt: input.startedAt,
      version: 0,
    });
  }

  static restore(id: UniqueEntityId, properties: StreakProperties): Streak {
    if (properties.currentDays < 0 || properties.longestDays < properties.currentDays) {
      throw new Error(`Corrupted gamification_streaks row: ${id.value}`);
    }

    return new Streak(id, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get currentDays(): number {
    return this.properties.currentDays;
  }

  get longestDays(): number {
    return this.properties.longestDays;
  }

  get startedAt(): Date {
    return this.properties.startedAt;
  }

  get version(): number {
    return this.properties.version;
  }
}
