import { assertNever } from '@shared/domain/assert-never.js';
import type { AwardedBadgePayload, BadgesAwardedPayload } from '../domain/events/badges-awarded.js';
import { BADGE_ANNOUNCEMENT_MESSAGES, BADGE_COPY } from './gamification.messages.js';

/** The one `BADGE_AWARDED` an evaluation is allowed to push, already worded. */
export interface BadgeAnnouncement {
  readonly userId: string;
  readonly badgeId: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Words what an evaluation awarded, for the notification that interrupts.
 *
 * **One evaluation interrupts at most once.** The badge named is the last one
 * awarded in catalogue order — within a family, the highest threshold reached —
 * and the description counts the rest. The others are on `/achievements`; a
 * modal per badge would be the harassment the notifications module forbids.
 */
export function announceAwardedBadges(payload: BadgesAwardedPayload): BadgeAnnouncement | null {
  const featured = payload.awards.at(-1);

  if (featured === undefined) {
    return null;
  }

  const others = payload.awards.length - 1;

  return {
    userId: payload.userId,
    badgeId: featured.badgeId,
    title: BADGE_COPY[featured.badgeId].title,
    description: `${describeAward(featured)}${others > 0 ? BADGE_ANNOUNCEMENT_MESSAGES.othersRecorded(others) : ''}`,
  };
}

function describeAward(award: AwardedBadgePayload): string {
  switch (award.family) {
    case 'STREAK':
      return BADGE_ANNOUNCEMENT_MESSAGES.streak(award.attainedValue, award.isLowerBound);
    case 'CEILING':
      return BADGE_ANNOUNCEMENT_MESSAGES.ceiling(award.attainedValue);
    case 'REDUCTION':
      return BADGE_ANNOUNCEMENT_MESSAGES.reduction(award.attainedValue);
    case 'SAVINGS':
      return BADGE_ANNOUNCEMENT_MESSAGES.savings(award.attainedValue);
    default:
      return assertNever(award.family);
  }
}
