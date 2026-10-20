import { z } from 'zod';
import type { Logger } from '@shared/infrastructure/logger.js';
import type {
  HumanVerificationVerdict,
  HumanVerifier,
} from '../application/ports/human-verifier.port.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Registration waits on this, so a slow provider must not hang the form. */
const REQUEST_TIMEOUT_IN_MILLISECONDS = 5_000;

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).default([]),
});

/**
 * Cloudflare Turnstile's server-side check. The caller's address is not sent:
 * Turnstile does not need it, and an address is personal data this platform has
 * no reason to hand to a third party.
 *
 * A token is single-use, so the frontend resets its widget after every refused
 * submission.
 */
export class TurnstileHumanVerifier implements HumanVerifier {
  constructor(
    private readonly secretKey: string,
    private readonly logger: Logger,
  ) {}

  async verify(token: string): Promise<HumanVerificationVerdict> {
    if (token.length === 0) {
      return 'FAILED';
    }

    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret: this.secretKey, response: token }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS),
    }).catch(() => null);

    if (response === null || !response.ok) {
      this.logger.warn({ status: response?.status ?? null }, 'turnstile did not answer');

      return 'UNREACHABLE';
    }

    return this.verdictFrom(await response.json().catch(() => null));
  }

  private verdictFrom(body: unknown): HumanVerificationVerdict {
    const parsed = siteverifyResponseSchema.safeParse(body);

    if (!parsed.success) {
      this.logger.warn('turnstile answered an unreadable body');

      return 'UNREACHABLE';
    }

    if (!parsed.data.success) {
      // Error codes describe the token or our configuration, never the person.
      this.logger.info({ errorCodes: parsed.data['error-codes'] }, 'turnstile refused a token');

      return 'FAILED';
    }

    return 'PASSED';
  }
}
