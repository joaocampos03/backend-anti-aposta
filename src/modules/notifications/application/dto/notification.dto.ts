import type {
  AwarenessNudgeContent,
  NotificationContent,
} from '../../domain/notification-content.js';

export interface NotificationDto {
  /** Also the stream's event id: a reconnecting browser resumes after it. */
  readonly id: string;
  readonly recipientId: string;
  readonly createdAt: string;
  readonly content: NotificationContent;
}

/**
 * What the demonstration console sends. A nudge arrives without its yield:
 * the figure is `awareness`'s to compute, never a number a form typed in.
 */
export type DemoNotificationDraft =
  | Omit<AwarenessNudgeContent, 'yieldInCents' | 'annualRatePercent'>
  | Exclude<NotificationContent, AwarenessNudgeContent>;

export interface SendDemoNotificationInput {
  readonly recipientId: string;
  readonly draft: DemoNotificationDraft;
}

export interface AnnounceIngestedTransactionsInput {
  readonly userId: string;
  readonly ingestedCount: number;
}

export interface ReplayNotificationsInput {
  readonly userId: string;
  /** The browser's `Last-Event-ID`, or null on a fresh connection. */
  readonly lastSeenId: string | null;
}
