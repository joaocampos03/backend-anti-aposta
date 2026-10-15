import { z } from 'zod';
import { BET_DETECTION_MESSAGES } from '../application/bet-detection.messages.js';

const REASON_MAXIMUM_LENGTH = 280;

export const transactionIdParamsSchema = z.object({
  transactionId: z.string().uuid({ message: BET_DETECTION_MESSAGES.transactionNotFound }),
});

export type TransactionIdParams = z.infer<typeof transactionIdParamsSchema>;

/**
 * `verdict` is an enum with one member on purpose. The inverse correction
 * ("this *was* a bet") is a larger product decision with no screen behind it,
 * and a boolean here would have to be widened later.
 *
 * Strict: who overrode and when are the server's to decide. A client that could
 * send `overriddenAt` could rewrite history.
 */
export const classificationOverrideBodySchema = z.strictObject(
  {
    verdict: z.literal('NOT_A_BET'),
    reason: z.string().trim().max(REASON_MAXIMUM_LENGTH).optional(),
  },
  { error: BET_DETECTION_MESSAGES.validationFailed },
);

export type ClassificationOverrideBody = z.infer<typeof classificationOverrideBodySchema>;

const DEFAULT_BET_WINDOW_IN_DAYS = 360;

/**
 * A closed set rather than a bounded integer. The client sends a window and
 * nothing else — no amount, no rate, no category — so an arbitrary `days=137`
 * would be a slice no figure on the screen was designed to describe.
 */
const betWindowSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(180),
  z.literal(360),
]);

export const betSummaryQuerySchema = z.object({
  days: z.coerce.number().int().pipe(betWindowSchema).default(DEFAULT_BET_WINDOW_IN_DAYS),
});

export type BetSummaryQuery = z.infer<typeof betSummaryQuerySchema>;
