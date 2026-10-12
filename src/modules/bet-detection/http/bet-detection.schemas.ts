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
