import { describe, expect, it } from 'vitest';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { anEmptyBadgeCollection } from '../testing/gamification.builders.js';
import type { Attainment } from './badge-attainment.js';
import type { FamilyAttainments } from './badge-collection.js';
import type { BadgeFamily } from './badge-catalogue.js';
import { BadgesAwarded } from './events/badges-awarded.js';

const ids = new SequentialIdGenerator();
const NOW = { awardedAt: new Date('2026-10-17T13:00:00.000Z'), nextId: () => ids.generate() };
const LATER = { awardedAt: new Date('2026-11-02T13:00:00.000Z'), nextId: () => ids.generate() };

function streakOf(days: number, startsBeforeWindow = false): Attainment {
  return { value: days, evidence: { kind: 'CURRENT_STREAK', days, startsBeforeWindow } };
}

function attainments(entries: readonly (readonly [BadgeFamily, Attainment])[]): FamilyAttainments {
  return new Map(entries);
}

describe('BadgeCollection.awardDue', () => {
  it('awards nothing below every threshold', () => {
    const collection = anEmptyBadgeCollection();

    expect(collection.awardDue(attainments([['STREAK', streakOf(6)]]), NOW)).toEqual([]);
    expect(collection.pullEvents()).toEqual([]);
  });

  it('awards every badge of a family that the figure has passed, in one event', () => {
    const collection = anEmptyBadgeCollection();

    collection.awardDue(attainments([['STREAK', streakOf(31, true)]]), NOW);

    const events = collection.pullEvents().filter((event) => event instanceof BadgesAwarded);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.awards).toEqual([
      { badgeId: 'streak-7', family: 'STREAK', attainedValue: 31, isLowerBound: true },
      { badgeId: 'streak-15', family: 'STREAK', attainedValue: 31, isLowerBound: true },
      { badgeId: 'streak-30', family: 'STREAK', attainedValue: 31, isLowerBound: true },
    ]);
  });

  it('does not award a badge twice, and keeps the first instant', () => {
    const collection = anEmptyBadgeCollection();
    collection.awardDue(attainments([['STREAK', streakOf(8)]]), NOW);
    collection.pullEvents();

    expect(collection.awardDue(attainments([['STREAK', streakOf(9)]]), LATER)).toEqual([]);
    expect(collection.pullEvents()).toEqual([]);
    expect(collection.badgeOf('streak-7')?.awardedAt).toEqual(NOW.awardedAt);
  });

  it('never takes a badge back when the figure falls', () => {
    const collection = anEmptyBadgeCollection();
    collection.awardDue(attainments([['STREAK', streakOf(8)]]), NOW);

    collection.awardDue(attainments([['STREAK', streakOf(0)]]), LATER);

    expect(collection.holds('streak-7')).toBe(true);
  });

  it('awards nothing for a family that could not be measured', () => {
    const collection = anEmptyBadgeCollection();

    expect(collection.awardDue(attainments([]), NOW)).toEqual([]);
  });
});

describe('BadgeCollection.forgetMeasured', () => {
  it('forgets what the statement measured and keeps what the person recorded', () => {
    const collection = anEmptyBadgeCollection();
    collection.awardDue(
      attainments([
        ['STREAK', streakOf(8)],
        ['SAVINGS', { value: 1, evidence: { kind: 'REACHED_GOALS', count: 1, titles: ['Reserva'] } }],
      ]),
      NOW,
    );

    expect(collection.forgetMeasured()).toBe(1);
    expect(collection.heldBadges.map((badge) => badge.kind)).toEqual(['savings-1']);
    expect(collection.forgottenKinds()).toEqual(['streak-7']);
  });
});
