import { z } from 'zod';
import { GAMIFICATION_MESSAGES } from '../application/gamification.messages.js';
import type { CursorDto } from '../application/dto/savings-goal.dto.js';
import { CEILING_DESTINATION_MAXIMUM_LENGTH } from '../domain/ceiling-destination.js';
import { MOVEMENT_DIRECTIONS } from '../domain/goal-movement.js';
import { GOAL_PURPOSES } from '../domain/goal-purpose.js';
import { GOAL_TITLE_MAXIMUM_LENGTH, GOAL_TITLE_MINIMUM_LENGTH } from '../domain/goal-title.js';

const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 100;

/** A client's retry key: long enough to be unique, short enough for its column. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Money arrives as it leaves: `{ amountInCents, currency }`. The bounds that
 * mean something — positive for a goal, zero allowed for a ceiling — are the
 * domain's, which answers them per field in the same envelope.
 */
const moneySchema = z.strictObject(
  {
    amountInCents: z.number({ message: GAMIFICATION_MESSAGES.amountInvalid }).int(GAMIFICATION_MESSAGES.amountInvalid),
    currency: z.literal('BRL', { message: GAMIFICATION_MESSAGES.amountInvalid }),
  },
  { error: GAMIFICATION_MESSAGES.amountInvalid },
);

/**
 * Strict: the balance, the reached date and the version are the server's to
 * decide. A client that could send `savedInCents` could write its own ledger.
 */
export const createSavingsGoalBodySchema = z.strictObject(
  {
    title: z
      .string({ message: GAMIFICATION_MESSAGES.titleTooShort })
      .trim()
      .min(GOAL_TITLE_MINIMUM_LENGTH, GAMIFICATION_MESSAGES.titleTooShort)
      .max(GOAL_TITLE_MAXIMUM_LENGTH, GAMIFICATION_MESSAGES.titleTooLong),
    purpose: z.enum(GOAL_PURPOSES, { message: GAMIFICATION_MESSAGES.purposeInvalid }),
    target: moneySchema,
  },
  { error: GAMIFICATION_MESSAGES.validationFailed },
);

export type CreateSavingsGoalBody = z.infer<typeof createSavingsGoalBodySchema>;

/** When it happened is the server's clock, never the client's. */
export const recordMovementBodySchema = z.strictObject(
  {
    direction: z.enum(MOVEMENT_DIRECTIONS, { message: GAMIFICATION_MESSAGES.directionInvalid }),
    amount: moneySchema,
  },
  { error: GAMIFICATION_MESSAGES.validationFailed },
);

export type RecordMovementBody = z.infer<typeof recordMovementBodySchema>;

export const idempotencyHeadersSchema = z.object({
  'idempotency-key': z
    .string()
    .regex(IDEMPOTENCY_KEY_PATTERN, GAMIFICATION_MESSAGES.idempotencyKeyInvalid)
    .optional(),
});

export type IdempotencyHeaders = z.infer<typeof idempotencyHeadersSchema>;

export const setBettingCeilingBodySchema = z.strictObject(
  {
    amount: moneySchema,
    destination: z
      .string()
      .max(CEILING_DESTINATION_MAXIMUM_LENGTH, GAMIFICATION_MESSAGES.destinationTooLong)
      .nullable()
      .optional(),
  },
  { error: GAMIFICATION_MESSAGES.validationFailed },
);

export type SetBettingCeilingBody = z.infer<typeof setBettingCeilingBodySchema>;

export const goalIdParamsSchema = z.object({
  goalId: z.uuid({ message: GAMIFICATION_MESSAGES.goalNotFound }),
});

export type GoalIdParams = z.infer<typeof goalIdParamsSchema>;

/**
 * An opaque cursor over `(at, id)`. Opaque on purpose: a client that could read
 * it would start constructing one, and the pair is a detail of the sort order.
 */
export function encodeCursor(cursor: CursorDto): string {
  return Buffer.from(JSON.stringify({ a: cursor.at, i: cursor.id })).toString('base64url');
}

function decodeCursor(raw: string): CursorDto | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const parsed = z.object({ a: z.iso.datetime(), i: z.uuid() }).safeParse(decoded);

    return parsed.success ? { at: parsed.data.a, id: parsed.data.i } : null;
  } catch {
    // A cursor we cannot read is a cursor we did not issue.
    return null;
  }
}

const cursorSchema = z
  .string()
  .transform((raw, context) => {
    const decoded = decodeCursor(raw);

    if (decoded === null) {
      context.addIssue({ code: 'custom', message: GAMIFICATION_MESSAGES.listInvalid });

      return z.NEVER;
    }

    return decoded;
  })
  .optional();

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAXIMUM_LIMIT).default(DEFAULT_LIMIT),
  cursor: cursorSchema,
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
