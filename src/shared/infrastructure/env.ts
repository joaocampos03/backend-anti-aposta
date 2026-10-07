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
  SESSION_TTL_IN_DAYS: z.coerce.number().int().positive().max(365).default(14),
  /** A session this close to expiring is extended when it is used. */
  SESSION_RENEW_WITHIN_DAYS: z.coerce.number().int().positive().max(365).default(7),
  REGISTRATION_CONSENT_POLICY_VERSION: z.string().min(1),
  REGISTRATION_ATTEMPTS_PER_HOUR: z.coerce.number().int().positive().default(20),
  REGISTRATION_SUCCESSES_PER_HOUR: z.coerce.number().int().positive().default(5),
  /**
   * The per-IP window that catches credential spraying across many addresses.
   * The per-account window that matters lives in the domain, in `SignInThrottle`.
   */
  SIGN_IN_ATTEMPTS_PER_QUARTER_HOUR: z.coerce.number().int().positive().default(50),
  PASSWORD_RESET_ATTEMPTS_PER_HOUR: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

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
