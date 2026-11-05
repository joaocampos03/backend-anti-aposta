import type {
  AwarenessNudgeContent,
  NotificationContent,
  TransactionsIngestedContent,
} from '../../domain/notification-content.js';
import type { MovementLine } from '../ports/movement-reader.port.js';

export interface NotificationDto {
  /** Also the stream's event id: a reconnecting browser resumes after it. */
  readonly id: string;
  readonly recipientId: string;
  readonly createdAt: string;
  /** Null until the person has seen it in their list. */
  readonly readAt: string | null;
  readonly content: NotificationContent;
  /** Filled by the list alone: the stream carries a count, never a movement. */
  readonly movements: readonly MovementLine[];
}

/**
 * What the demonstration console sends. A nudge arrives without its yield:
 * the figure is `awareness`'s to compute, never a number a form typed in.
 */
export type DemoNotificationDraft =
  | Omit<AwarenessNudgeContent, 'yieldInCents' | 'annualRatePercent'>
  | Omit<TransactionsIngestedContent, 'transactionIds'>
  | Exclude<NotificationContent, AwarenessNudgeContent | TransactionsIngestedContent>;

export interface SendDemoNotificationInput {
  readonly recipientId: string;
  readonly draft: DemoNotificationDraft;
}

export interface AnnounceIngestedTransactionsInput {
  readonly userId: string;
  readonly transactionIds: readonly string[];
}

export interface ListNotificationsInput {
  readonly userId: string;
}

export interface MarkNotificationsReadInput {
  readonly userId: string;
  readonly notificationIds: readonly string[];
}

export interface ReplayNotificationsInput {
  readonly userId: string;
  /** The browser's `Last-Event-ID`, or null on a fresh connection. */
  readonly lastSeenId: string | null;
}

/** Already worded by `gamification`, which owns what a badge is called and what earned it. */
export interface AnnounceAwardedBadgeInput {
  readonly userId: string;
  readonly badgeId: string;
  readonly title: string;
  readonly description: string;
}
