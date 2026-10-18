import type { DayKey } from '@shared/domain/calendar.js';
import type { AttainmentEvidence } from '../../domain/badge-attainment.js';
import type { BadgeFamily, BadgeId } from '../../domain/badge-catalogue.js';
import type { BetMatch } from '../../domain/bet-day.js';
import type { StatementReadiness } from '../ports/monthly-bet-history-reader.port.js';

export interface BetDayDto {
  readonly dayKey: DayKey;
  readonly counterparty: string;
  readonly matchedBy: BetMatch;
}

export interface BetFreeStreakDto {
  readonly lengthInDays: number;
  readonly firstDayKey: DayKey;
  readonly lastDayKey: DayKey;
  readonly startsBeforeWindow: boolean;
  readonly endedBy: BetDayDto;
}

export interface StreakRecordDto {
  readonly window: { readonly firstDayKey: DayKey; readonly dayCount: number };
  readonly current: {
    readonly days: number;
    readonly hasBetToday: boolean;
    readonly startsBeforeWindow: boolean;
    readonly lastBet: BetDayDto | null;
  };
  readonly longest: BetFreeStreakDto | null;
  /** The longest few only; `closedStreakCount` is all of them. */
  readonly closedStreaks: readonly BetFreeStreakDto[];
  readonly closedStreakCount: number;
  readonly betDayCount: number;
  readonly betFreeDayCount: number;
  /** Newest first, today included. */
  readonly recentDays: readonly { readonly dayKey: DayKey; readonly hasBet: boolean }[];
}

/** Primitives only, so the domain's own union is already the wire's. */
export type AttainmentEvidenceDto = AttainmentEvidence;

export type BadgeStatus = 'EARNED' | 'UNEARNED';

export interface BadgeDto {
  readonly id: BadgeId;
  readonly family: BadgeFamily;
  readonly title: string;
  readonly criterion: string;
  readonly threshold: number;
  readonly status: BadgeStatus;
  /** ISO 8601; set exactly when earned, and never cleared. */
  readonly awardedAt: string | null;
  /** Today's figure, uncapped; `null` while the family cannot be measured. */
  readonly currentValue: number | null;
  readonly progressPercent: number | null;
  readonly evidence: AttainmentEvidenceDto | null;
}

export interface AchievementsOutput {
  readonly syncStatus: StatementReadiness;
  readonly todayKey: DayKey;
  readonly streak: StreakRecordDto | null;
  /** The whole catalogue, in catalogue order. */
  readonly badges: readonly BadgeDto[];
}

export interface AchievementsInput {
  readonly userId: string;
}
