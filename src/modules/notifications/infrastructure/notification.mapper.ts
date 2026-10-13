import type { Prisma, Notification as NotificationRow } from '@prisma/client';
import { z } from 'zod';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { NotificationContent } from '../domain/notification-content.js';
import { Notification } from '../domain/notification.js';

/**
 * `content` is JSONB, so it is read back through the same shape it was written
 * with rather than trusted: a row that no longer parses is a bug to surface,
 * not a payload to push to somebody's screen.
 */
const storedContentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('AWARENESS_NUDGE'),
    merchant: z.string(),
    amountInCents: z.number().int(),
    yieldInCents: z.number().int(),
    annualRatePercent: z.number(),
    monthlyTotalInCents: z.number().int(),
    matchedBy: z.string(),
  }),
  z.object({
    kind: z.literal('BADGE_AWARDED'),
    badgeId: z.string(),
    title: z.string(),
    description: z.string(),
  }),
  z.object({ kind: z.literal('STREAK_BROKEN'), previousDays: z.number().int() }),
  z.object({
    kind: z.literal('GOAL_REACHED'),
    label: z.string(),
    amountInCents: z.number().int(),
  }),
  z.object({ kind: z.literal('TRANSACTIONS_INGESTED'), ingestedCount: z.number().int() }),
]);

export class NotificationMapper {
  static toDomain(row: NotificationRow): Notification {
    return Notification.restore(UniqueEntityId.restore(row.id), {
      recipientId: UniqueEntityId.restore(row.recipientId),
      content: contentOf(row),
      createdAt: row.createdAt,
    });
  }

  static toRow(notification: Notification): Prisma.NotificationCreateInput {
    return {
      id: notification.id.value,
      recipientId: notification.recipientId.value,
      kind: notification.content.kind,
      content: { ...notification.content },
      createdAt: notification.createdAt,
    };
  }
}

function contentOf(row: NotificationRow): NotificationContent {
  const parsed = storedContentSchema.safeParse(row.content);

  if (!parsed.success || parsed.data.kind !== row.kind) {
    throw new Error(`Notification ${row.id} has content that does not match its kind`);
  }

  return parsed.data;
}
