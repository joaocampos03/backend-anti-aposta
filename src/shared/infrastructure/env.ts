import 'dotenv/config';
import { z } from 'zod';

/**
 * The only file in the repository allowed to read `process.env`. A missing
 * variable fails at startup, not at 2 a.m. inside a route handler.
 */
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url(),
  /**
   * Who may report a client address through `X-Forwarded-For`, in Express
   * `trust proxy` syntax (`loopback`, an address, a CIDR, a comma-separated
   * list), or `none`. Every browser request reaches this API through the Next.js
   * server, so without this every per-IP limit would count all users as one —
   * one person could spend the sign-in quota for everybody. Name the Next.js
   * server's address and nothing wider: a trusted hop can claim any address.
   */
  TRUST_PROXY: z
    .string()
    .min(1)
    .default('loopback')
    .transform((value) => (value === 'none' ? false : value)),
  SESSION_TTL_IN_DAYS: z.coerce.number().int().positive().max(365).default(14),
  /** A session this close to expiring is extended when it is used. */
  SESSION_RENEW_WITHIN_DAYS: z.coerce.number().int().positive().max(365).default(7),
  REGISTRATION_CONSENT_POLICY_VERSION: z.string().min(1),
  /**
   * Day and month boundaries. A bet at 23:30 in São Paulo belongs to that day;
   * bucketing in UTC would move it and cost somebody a streak day.
   */
  TIME_ZONE: z.string().min(1).default('America/Sao_Paulo'),
  REGISTRATION_ATTEMPTS_PER_HOUR: z.coerce.number().int().positive().default(20),
  REGISTRATION_SUCCESSES_PER_HOUR: z.coerce.number().int().positive().default(5),
  /**
   * The per-IP window that catches credential spraying across many addresses.
   * The per-account window that matters lives in the domain, in `SignInThrottle`.
   */
  SIGN_IN_ATTEMPTS_PER_QUARTER_HOUR: z.coerce.number().int().positive().default(50),
  PASSWORD_RESET_ATTEMPTS_PER_HOUR: z.coerce.number().int().positive().default(10),
  /** So a script cannot rewrite a betting history through the override endpoint. */
  CLASSIFICATION_OVERRIDES_PER_HOUR: z.coerce.number().int().positive().default(30),
  /** Starting, completing and synchronising a consent: each one calls the DataHolder. */
  CONSENT_COMMANDS_PER_HOUR: z.coerce.number().int().positive().default(60),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // -------------------------------------------------------------------------
  // Open Finance: this platform as the DataRecipient
  // -------------------------------------------------------------------------
  /**
   * AES-256-GCM key for the DataHolder's tokens and the PKCE verifier at rest:
   * 32 random bytes, base64. `openssl rand -base64 32`.
   */
  OPEN_FINANCE_TOKEN_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'must be 32 bytes, base64-encoded',
    }),
  OPEN_FINANCE_CLIENT_ID: z.string().min(1).default('anti-aposta'),
  OPEN_FINANCE_CLIENT_SECRET: z.string().min(16),
  /** The frontend route that receives the DataHolder's redirect and relays it here. */
  OPEN_FINANCE_REDIRECT_URI: z.url().default('http://localhost:3000/api/open-finance/callback'),
  /**
   * Where the DataHolder tells this platform that a consent's resources
   * changed. Enrolled at the institution like the redirect; the notice only
   * prompts a synchronisation, it carries no data.
   */
  OPEN_FINANCE_NOTICE_URI: z.url().default('http://localhost:3333/api/v1/data-holder-notices'),

  // -------------------------------------------------------------------------
  // sandbox-bank: the simulated DataHolder, reached over HTTP like any other
  // -------------------------------------------------------------------------
  /** Where `open-finance` reaches the sandbox's Open Finance surface. */
  SANDBOX_BANK_BASE_URL: z.url().default('http://localhost:3333/sandbox/open-finance/v2'),
  /** The bank's authorisation screen, rendered by the frontend. */
  SANDBOX_BANK_AUTHORISATION_URL: z.url().default('http://localhost:3000/sandbox/authorize'),
  /**
   * Whether a person may book entries at the sandbox. Never in production,
   * whatever this says: a fabricated movement must not be able to reach a real
   * person's statement.
   */
  SANDBOX_BANK_LEDGER_WRITES: z.enum(['enabled', 'disabled']).default('enabled'),
  SANDBOX_BANK_LEDGER_ENTRIES_PER_HOUR: z.coerce.number().int().positive().default(120),
  /**
   * The demonstration console's sends to a person by id. Mounted on the same
   * switch as the sandbox's ledger writes, so never in production.
   */
  DEMO_NOTIFICATIONS_PER_HOUR: z.coerce.number().int().positive().default(120),
});

export type Environment = z.infer<typeof environmentSchema>;

/** The one switch whose answer depends on two variables. */
export function sandboxLedgerWritesEnabled(environment: Environment): boolean {
  return environment.NODE_ENV !== 'production' && environment.SANDBOX_BANK_LEDGER_WRITES === 'enabled';
}

function readEnvironment(): Environment {
  const parsed = environmentSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment: ${problems}`);
  }

  return parsed.data;
}

export const env: Environment = readEnvironment();
