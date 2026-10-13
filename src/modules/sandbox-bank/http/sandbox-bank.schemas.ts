import { z } from 'zod';

/**
 * The specification identifies a consent by a URN the institution chooses. The
 * sandbox's is `urn:sandbox-bank:<uuid>`; the uuid is all that crosses into the
 * application layer.
 */
export const CONSENT_URN_PREFIX = 'urn:sandbox-bank:';
const CONSENT_SCOPE_PREFIX = 'consent:';
/** RFC 7636 §4.1: the unreserved characters, 43 to 128 of them. */
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
/** BASE64URL of a SHA-256: always 43 characters. */
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9\-_]{43}$/;
const DOCUMENT_PATTERN = /^\d{11}$|^\d{14}$/;
const MAXIMUM_PAGE_SIZE = 1000;
const DEFAULT_PAGE_SIZE = 25;
const STATE_MAXIMUM_LENGTH = 512;
const MAXIMUM_SELECTED_ACCOUNTS = 10;

const consentUrnSchema = z
  .string()
  .startsWith(CONSENT_URN_PREFIX)
  .transform((urn) => urn.slice(CONSENT_URN_PREFIX.length))
  .pipe(z.uuid());

/** `openid accounts consent:urn:sandbox-bank:<uuid>` — the consent rides in the scope. */
const scopeSchema = z
  .string()
  .transform((scope) => {
    const consentScope = scope.split(' ').find((part) => part.startsWith(CONSENT_SCOPE_PREFIX));

    return consentScope?.slice(CONSENT_SCOPE_PREFIX.length) ?? '';
  })
  .pipe(consentUrnSchema);

const permissionSchema = z.enum(['ACCOUNTS_READ', 'ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ']);
const entryTypeSchema = z.enum([
  'PIX',
  'TED',
  'BOLETO',
  'CONVENIO_ARRECADACAO',
  'CARTAO',
  'FOLHA_PAGAMENTO',
  'TRANSFERENCIA_MESMA_INSTITUICAO',
]);

// ---------------------------------------------------------------------------
// The Open Finance surface, called by a DataRecipient
// ---------------------------------------------------------------------------

/** RFC 6749 §4: form-encoded, snake_case, one shape per grant. */
export const tokenRequestSchema = z.object({
  grant_type: z.enum(['client_credentials', 'authorization_code', 'refresh_token']),
  code: z.string().min(1).optional(),
  redirect_uri: z.url().optional(),
  code_verifier: z.string().regex(CODE_VERIFIER_PATTERN).optional(),
  refresh_token: z.string().min(1).optional(),
  /** `client_secret_post`, for a client that cannot send HTTP Basic. */
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

export type TokenRequest = z.infer<typeof tokenRequestSchema>;

export const createConsentBodySchema = z.object({
  data: z.object({
    permissions: z.array(permissionSchema).min(1),
    expirationDateTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  }),
});

export type CreateConsentBody = z.infer<typeof createConsentBodySchema>;

export const consentParamsSchema = z.object({ consentId: consentUrnSchema });

export type ConsentParams = z.infer<typeof consentParamsSchema>;

export const sharedAccountParamsSchema = z.object({ accountId: z.uuid() });

export type SharedAccountParams = z.infer<typeof sharedAccountParamsSchema>;

/** Booking dates are calendar days: `from` opens the day, `to` closes it. */
export const sharedTransactionsQuerySchema = z.object({
  fromBookingDate: z.iso
    .date()
    .transform((day) => new Date(`${day}T00:00:00.000Z`))
    .optional(),
  toBookingDate: z.iso
    .date()
    .transform((day) => new Date(`${day}T23:59:59.999Z`))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  'page-size': z.coerce.number().int().min(1).max(MAXIMUM_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type SharedTransactionsQuery = z.infer<typeof sharedTransactionsQuerySchema>;

// ---------------------------------------------------------------------------
// The bank's own screens, called by the frontend for the signed-in person
// ---------------------------------------------------------------------------

/** The authorisation request exactly as the client put it in the URL. */
export const authorisationQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  scope: scopeSchema,
  state: z.string().min(1).max(STATE_MAXIMUM_LENGTH),
  code_challenge: z.string().regex(CODE_CHALLENGE_PATTERN),
  code_challenge_method: z.literal('S256'),
});

export type AuthorisationQuery = z.infer<typeof authorisationQuerySchema>;

/** The same request carried back by the screen, with the person's answer. */
export const authorisationDecisionBodySchema = z.strictObject({
  clientId: z.string().min(1),
  redirectUri: z.url(),
  scope: scopeSchema,
  state: z.string().min(1).max(STATE_MAXIMUM_LENGTH),
  codeChallenge: z.string().regex(CODE_CHALLENGE_PATTERN),
  codeChallengeMethod: z.literal('S256'),
  decision: z.enum(['APPROVE', 'REJECT']),
  accountIds: z.array(z.uuid()).max(MAXIMUM_SELECTED_ACCOUNTS).default([]),
});

export type AuthorisationDecisionBody = z.infer<typeof authorisationDecisionBodySchema>;

export const customerAccountParamsSchema = z.object({ accountId: z.uuid() });

export type CustomerAccountParams = z.infer<typeof customerAccountParamsSchema>;

/**
 * A movement to book at the bank. Signed cents, as everywhere in this API:
 * negative leaves the account. `merchantCategoryCode` is how a card payment to
 * a bookmaker announces itself; leave it out for a PIX.
 */
export const ledgerEntryBodySchema = z.strictObject({
  amountInCents: z
    .number()
    .int()
    .refine((cents) => cents !== 0, { message: 'TOO_SMALL' }),
  transactionName: z.string().trim().min(1).max(140),
  type: entryTypeSchema,
  status: z.enum(['TRANSACAO_EFETIVADA', 'LANCAMENTO_FUTURO']).default('TRANSACAO_EFETIVADA'),
  bookedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  merchantCategoryCode: z.number().int().min(0).max(9999).nullable().default(null),
  payeeDocument: z.string().regex(DOCUMENT_PATTERN).nullable().default(null),
});

export type LedgerEntryBody = z.infer<typeof ledgerEntryBodySchema>;
