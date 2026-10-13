/**
 * What the platform pushes, one variant per kind. Every field is a primitive
 * that is already safe to put on a lock screen: amounts in cents, ids, short
 * display text — never a raw statement line, never a token.
 */
export const NOTIFICATION_KINDS = [
  'AWARENESS_NUDGE',
  'BADGE_AWARDED',
  'STREAK_BROKEN',
  'GOAL_REACHED',
  'TRANSACTIONS_INGESTED',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface AwarenessNudgeContent {
  readonly kind: 'AWARENESS_NUDGE';
  /** The bookmaker as the statement names it, already normalised. */
  readonly merchant: string;
  readonly amountInCents: number;
  /** The amount reframed by `awareness`, with the rate that produced it. */
  readonly yieldInCents: number;
  readonly annualRatePercent: number;
  readonly monthlyTotalInCents: number;
  /** How the transaction was recognised, e.g. "MCC 7995". */
  readonly matchedBy: string;
}

export interface BadgeAwardedContent {
  readonly kind: 'BADGE_AWARDED';
  /** An id from the frontend's badge catalogue; the payload still renders without it. */
  readonly badgeId: string;
  readonly title: string;
  readonly description: string;
}

export interface StreakBrokenContent {
  readonly kind: 'STREAK_BROKEN';
  readonly previousDays: number;
}

export interface GoalReachedContent {
  readonly kind: 'GOAL_REACHED';
  readonly label: string;
  readonly amountInCents: number;
}

/** New movements reached the statement: the screens showing it should read it again. */
export interface TransactionsIngestedContent {
  readonly kind: 'TRANSACTIONS_INGESTED';
  readonly ingestedCount: number;
}

export type NotificationContent =
  | AwarenessNudgeContent
  | BadgeAwardedContent
  | StreakBrokenContent
  | GoalReachedContent
  | TransactionsIngestedContent;
