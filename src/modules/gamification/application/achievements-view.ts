import { BADGE_CATALOGUE, type BadgeDefinition } from '../domain/badge-catalogue.js';
import type { BadgeCollection, FamilyAttainments } from '../domain/badge-collection.js';
import type { BetDay } from '../domain/bet-day.js';
import type { BetFreeStreak, StreakRecord } from '../domain/streak-record.js';
import type { BadgeDto, BetDayDto, BetFreeStreakDto, StreakRecordDto } from './dto/achievements.dto.js';
import { BADGE_COPY } from './gamification.messages.js';

/** As many stretches as a phone can read without the list becoming a wall. */
export const VISIBLE_CLOSED_STREAKS = 6;
/** Two months of squares: long enough to show a pattern, short enough to read on a phone. */
export const RECENT_DAY_COUNT = 60;

const WHOLE = 100;

export function streakToDto(record: StreakRecord): StreakRecordDto {
  const { current } = record;

  return {
    window: { firstDayKey: record.firstDayKey, dayCount: record.windowDayCount },
    current: {
      days: current.days,
      hasBetToday: current.hasBetToday,
      startsBeforeWindow: current.startsBeforeWindow,
      lastBet: current.lastBet === null ? null : betDayToDto(current.lastBet),
    },
    longest: record.longest === null ? null : betFreeStreakToDto(record.longest),
    closedStreaks: record.closedStreaks.slice(0, VISIBLE_CLOSED_STREAKS).map(betFreeStreakToDto),
    closedStreakCount: record.closedStreaks.length,
    betDayCount: record.betDayCount,
    betFreeDayCount: record.betFreeDayCount,
    recentDays: record.recentDays(RECENT_DAY_COUNT),
  };
}

/**
 * Every badge in the catalogue, earned or not. Earned means **held** — awarded
 * once and never taken back — so a badge stays earned even when today's figure
 * has fallen below its threshold; the figure is still reported as it stands.
 */
export function badgesToDto(collection: BadgeCollection, attainments: FamilyAttainments): readonly BadgeDto[] {
  return BADGE_CATALOGUE.map((definition) => badgeToDto(definition, collection, attainments));
}

function badgeToDto(
  definition: BadgeDefinition,
  collection: BadgeCollection,
  attainments: FamilyAttainments,
): BadgeDto {
  const badge = collection.badgeOf(definition.id);
  const attainment = attainments.get(definition.family) ?? null;

  return {
    id: definition.id,
    family: definition.family,
    title: BADGE_COPY[definition.id].title,
    criterion: BADGE_COPY[definition.id].criterion,
    threshold: definition.threshold,
    status: badge === null ? 'UNEARNED' : 'EARNED',
    awardedAt: badge?.awardedAt.toISOString() ?? null,
    currentValue: attainment?.value ?? null,
    progressPercent:
      attainment === null ? null : Math.min(WHOLE, Math.round((attainment.value / definition.threshold) * WHOLE)),
    evidence: attainment?.evidence ?? null,
  };
}

function betDayToDto(day: BetDay): BetDayDto {
  return { dayKey: day.dayKey, counterparty: day.counterparty, matchedBy: day.matchedBy };
}

function betFreeStreakToDto(streak: BetFreeStreak): BetFreeStreakDto {
  return {
    lengthInDays: streak.lengthInDays,
    firstDayKey: streak.firstDayKey,
    lastDayKey: streak.lastDayKey,
    startsBeforeWindow: streak.startsBeforeWindow,
    endedBy: betDayToDto(streak.endedBy),
  };
}
