import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../application/app-error.js';

const SECONDS_IN_A_MINUTE = 60;
const MILLISECONDS_IN_A_SECOND = 1000;

export interface RateLimitSettings {
  readonly code: string;
  readonly message: string;
  readonly limit: number;
  readonly windowInMinutes: number;
  /** Counts only the requests that succeeded, so a typo is not a quota. */
  readonly countSuccessesOnly?: boolean;
}

/**
 * Per-IP, answered as the single error envelope. `retryAfterSeconds` travels in
 * `details` and the funnel mirrors it into the `Retry-After` header.
 *
 * It exists to make enumeration and credential spraying expensive — never to
 * punish somebody retyping a password. Nothing here locks an account: the window
 * passes and the correct password works.
 */
export function windowedRateLimit(settings: RateLimitSettings): RequestHandler {
  const windowInMilliseconds =
    settings.windowInMinutes * SECONDS_IN_A_MINUTE * MILLISECONDS_IN_A_SECOND;
  const retryAfterSeconds = Math.ceil(windowInMilliseconds / MILLISECONDS_IN_A_SECOND);

  return rateLimit({
    windowMs: windowInMilliseconds,
    limit: settings.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipFailedRequests: settings.countSuccessesOnly === true,
    handler: (_request, _response, next) => {
      next(new AppError(settings.code, settings.message, 429, { retryAfterSeconds }));
    },
  });
}
