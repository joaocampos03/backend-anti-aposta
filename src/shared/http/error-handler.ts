import { createHash } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../application/app-error.js';
import type { Logger } from '../infrastructure/logger.js';
import { HTTP_MESSAGES } from './http.messages.js';

const SERVER_ERROR = 500;
const IP_FINGERPRINT_LENGTH = 16;

/**
 * An address is personal data and a log line is forever. The fingerprint is
 * enough to tell two callers apart when reading a spike of failures, and not
 * enough to tell who either of them is.
 */
function fingerprintOf(address: string | undefined): string {
  if (address === undefined) {
    return 'unknown';
  }

  return createHash('sha256').update(address).digest('hex').slice(0, IP_FINGERPRINT_LENGTH);
}

interface BodyParserFailure {
  readonly status: number;
  readonly type: string;
}

function isBodyParserFailure(cause: unknown): cause is BodyParserFailure {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'status' in cause &&
    typeof cause.status === 'number' &&
    'type' in cause &&
    typeof cause.type === 'string' &&
    cause.status >= 400 &&
    cause.status < 500
  );
}

/**
 * The single place a response body is shaped for a failure. A stack trace, a SQL
 * error or a Prisma message never reaches the client: it is logged against the
 * request id, and the client gets the envelope.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (cause, request, response, next) => {
    if (response.headersSent) {
      next(cause);

      return;
    }

    const failure = toAppError(cause, response.locals.internalErrorMessage);
    const retryAfterSeconds = failure.details['retryAfterSeconds'];

    if (typeof retryAfterSeconds === 'number') {
      response.setHeader('Retry-After', retryAfterSeconds);
    }

    if (failure.status >= SERVER_ERROR) {
      logger.error(
        {
          requestId: response.locals.requestId,
          cause: cause instanceof Error ? cause.message : 'unknown',
        },
        'request failed unexpectedly',
      );
    } else {
      // The code, never the input: a duplicate registration logs
      // EMAIL_ALREADY_REGISTERED and a failed sign-in logs INVALID_CREDENTIALS,
      // neither of them the address that was tried.
      logger.info(
        {
          requestId: response.locals.requestId,
          code: failure.code,
          ipFingerprint: fingerprintOf(request.ip),
        },
        'request refused',
      );
    }

    response.status(failure.status).json({
      error: { code: failure.code, message: failure.message, details: failure.details },
    });
  };
}

function toAppError(cause: unknown, internalMessage: string | undefined): AppError {
  if (cause instanceof AppError) {
    return cause;
  }

  if (isBodyParserFailure(cause)) {
    return new AppError('MALFORMED_REQUEST', HTTP_MESSAGES.malformedRequest, 400);
  }

  return new AppError('INTERNAL_ERROR', internalMessage ?? HTTP_MESSAGES.internalError, 500);
}
