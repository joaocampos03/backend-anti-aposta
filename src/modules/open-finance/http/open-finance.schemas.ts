import { z } from 'zod';

const SEARCH_MAXIMUM_LENGTH = 120;
const DEFAULT_LIMIT = 50;
const MAXIMUM_LIMIT = 100;
const MAXIMUM_MONTHS = 12;

/**
 * An opaque cursor over `(occurredAt, id)`. Opaque on purpose: a client that
 * could read it would start constructing one, and the pair it encodes is an
 * implementation detail of the sort order.
 */
export interface LedgerCursorPayload {
  readonly occurredAt: string;
  readonly id: string;
}

export function encodeLedgerCursor(cursor: LedgerCursorPayload): string {
  return Buffer.from(JSON.stringify({ o: cursor.occurredAt, i: cursor.id })).toString('base64url');
}

function decodeLedgerCursor(raw: string): LedgerCursorPayload | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));

    if (typeof decoded !== 'object' || decoded === null) {
      return null;
    }

    const occurredAt = 'o' in decoded ? decoded.o : null;
    const id = 'i' in decoded ? decoded.i : null;

    if (typeof occurredAt !== 'string' || typeof id !== 'string') {
      return null;
    }

    return Number.isNaN(Date.parse(occurredAt)) ? null : { occurredAt, id };
  } catch {
    // A cursor we cannot read is a cursor we did not issue.
    return null;
  }
}

const cursorSchema = z
  .string()
  .transform((raw, context) => {
    const decoded = decodeLedgerCursor(raw);

    if (decoded === null) {
      context.addIssue({ code: 'custom', message: 'Não conseguimos aplicar esses filtros.' });

      return z.NEVER;
    }

    return decoded;
  })
  .optional();

export const listTransactionsQuerySchema = z.object({
  type: z.enum(['ALL', 'BETS', 'CREDITS', 'DEBITS']).default('ALL'),
  period: z.enum(['LAST_30_DAYS', 'LAST_90_DAYS', 'ALL_TIME']).default('LAST_30_DAYS'),
  accountId: z.string().uuid().optional(),
  q: z.string().trim().max(SEARCH_MAXIMUM_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(MAXIMUM_LIMIT).default(DEFAULT_LIMIT),
  cursor: cursorSchema,
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const consentParamsSchema = z.object({ consentId: z.uuid() });

export type ConsentParams = z.infer<typeof consentParamsSchema>;

const CALLBACK_VALUE_MAXIMUM_LENGTH = 512;

/**
 * The DataHolder's callback, relayed as it arrived: `code` and `state` on a
 * yes, `error` and `state` on a no. Exactly one of `code` and `error`.
 */
export const authorisationCallbackBodySchema = z.union([
  z.strictObject({
    state: z.string().min(1).max(CALLBACK_VALUE_MAXIMUM_LENGTH),
    code: z.string().min(1).max(CALLBACK_VALUE_MAXIMUM_LENGTH),
  }),
  z.strictObject({
    state: z.string().min(1).max(CALLBACK_VALUE_MAXIMUM_LENGTH),
    error: z.string().min(1).max(CALLBACK_VALUE_MAXIMUM_LENGTH),
  }),
]);

export type AuthorisationCallbackBody = z.infer<typeof authorisationCallbackBodySchema>;

export const monthlySummaryQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(MAXIMUM_MONTHS).default(MAXIMUM_MONTHS),
});

export type MonthlySummaryQuery = z.infer<typeof monthlySummaryQuerySchema>;

/** The longest DataHolder consent id the column holds. */
const EXTERNAL_CONSENT_ID_MAXIMUM_LENGTH = 100;

/**
 * A DataHolder's notice, in the Open Finance `data` envelope: which consent's
 * resources changed. It carries no movement, no amount and no user — those
 * are read over the protocol, with the consent's own token.
 */
export const dataHolderNoticeBodySchema = z.object({
  data: z.object({
    consentId: z.string().min(1).max(EXTERNAL_CONSENT_ID_MAXIMUM_LENGTH),
  }),
});

export type DataHolderNoticeBody = z.infer<typeof dataHolderNoticeBodySchema>;
