import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { assertNever } from '@shared/domain/assert-never.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { NotificationContent } from './notification-content.js';
import { NotificationsError } from './notifications.errors.js';

/** Long enough for a badge's evidence line, short enough for a lock screen. */
export const MAXIMUM_TEXT_LENGTH = 140;

interface NotificationProperties {
  readonly recipientId: UniqueEntityId;
  readonly content: NotificationContent;
  readonly createdAt: Date;
}

/**
 * One thing pushed to one person, kept in their inbox. The inbox is the source
 * of truth and the stream an optimisation: a notification exists before any
 * browser sees it, and its id — a UUID v7, so ordered by time — is what a
 * reconnecting stream resumes from.
 */
export class Notification extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: NotificationProperties,
  ) {
    super(id);
  }

  static compose(input: {
    readonly id: UniqueEntityId;
    readonly recipientId: UniqueEntityId;
    readonly content: NotificationContent;
    readonly createdAt: Date;
  }): Result<Notification, NotificationsError<'INVALID_NOTIFICATION'>> {
    if (!isDisplayable(input.content)) {
      return fail(NotificationsError.invalidNotification());
    }

    return ok(
      new Notification(input.id, {
        recipientId: input.recipientId,
        content: input.content,
        createdAt: input.createdAt,
      }),
    );
  }

  static restore(id: UniqueEntityId, properties: NotificationProperties): Notification {
    return new Notification(id, properties);
  }

  get recipientId(): UniqueEntityId {
    return this.properties.recipientId;
  }

  get content(): NotificationContent {
    return this.properties.content;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }
}

/** Whether a person could read it: no blank line, no fraction of a cent, no zero count. */
function isDisplayable(content: NotificationContent): boolean {
  switch (content.kind) {
    case 'AWARENESS_NUDGE':
      return (
        areTexts(content.merchant, content.matchedBy) &&
        areCents(content.amountInCents, content.yieldInCents, content.monthlyTotalInCents) &&
        content.amountInCents !== 0 &&
        content.annualRatePercent > 0
      );
    case 'BADGE_AWARDED':
      return areTexts(content.badgeId, content.title, content.description);
    case 'STREAK_BROKEN':
      return isPositiveCount(content.previousDays);
    case 'GOAL_REACHED':
      return areTexts(content.label) && areCents(content.amountInCents) && content.amountInCents > 0;
    case 'TRANSACTIONS_INGESTED':
      return isPositiveCount(content.ingestedCount);
    default:
      return assertNever(content);
  }
}

function areTexts(...values: readonly string[]): boolean {
  return values.every((value) => {
    const trimmed = value.trim();

    return trimmed.length > 0 && trimmed.length <= MAXIMUM_TEXT_LENGTH;
  });
}

function areCents(...values: readonly number[]): boolean {
  return values.every((value) => Number.isSafeInteger(value));
}

function isPositiveCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
