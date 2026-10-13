import { z } from 'zod';
import { MAXIMUM_TEXT_LENGTH } from '../domain/notification.js';

const text = z.string().trim().min(1).max(MAXIMUM_TEXT_LENGTH);
const cents = z.number().int();
const count = z.number().int().positive();

export const recipientParamsSchema = z.object({ userId: z.uuid() });

export type RecipientParams = z.infer<typeof recipientParamsSchema>;

/**
 * One shape per kind. A nudge has no yield field on purpose: `awareness`
 * computes it, so the console cannot show a figure the product would not.
 */
export const demoNotificationBodySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('AWARENESS_NUDGE'),
    merchant: text,
    amountInCents: cents.refine((value) => value !== 0, { message: 'TOO_SMALL' }),
    monthlyTotalInCents: cents.nonnegative(),
    matchedBy: text,
  }),
  z.strictObject({
    kind: z.literal('BADGE_AWARDED'),
    badgeId: text,
    title: text,
    description: text,
  }),
  z.strictObject({ kind: z.literal('STREAK_BROKEN'), previousDays: count }),
  z.strictObject({ kind: z.literal('GOAL_REACHED'), label: text, amountInCents: cents.positive() }),
  z.strictObject({ kind: z.literal('TRANSACTIONS_INGESTED'), ingestedCount: count }),
]);

export type DemoNotificationBody = z.infer<typeof demoNotificationBodySchema>;
