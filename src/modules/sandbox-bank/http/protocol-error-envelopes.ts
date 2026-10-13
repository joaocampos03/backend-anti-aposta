import type { ErrorRequestHandler } from 'express';
import { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';

const UNAUTHORISED = 401;

/**
 * The sandbox answers in the specification's shapes, not in this API's
 * envelope: a DataRecipient's client library parses these. Only expected
 * failures (`AppError`) are rendered here; anything else falls through to the
 * application's funnel, which logs it and answers 500.
 */

/** RFC 6749 §5.2: `{ error, error_description }`, lower snake case. */
export const oauthErrorEnvelope: ErrorRequestHandler = (cause, _request, response, next) => {
  if (!(cause instanceof AppError)) {
    next(cause);

    return;
  }

  if (cause.status === UNAUTHORISED) {
    response.setHeader('WWW-Authenticate', 'Basic realm="sandbox-bank"');
  }

  response.status(cause.status).json({
    error: cause.code.toLowerCase(),
    error_description: cause.message,
  });
};

/** Open Finance Brasil: `{ errors: [{ code, title, detail }], meta }`. */
export function openFinanceErrorEnvelope(clock: Clock): ErrorRequestHandler {
  return (cause, _request, response, next) => {
    if (!(cause instanceof AppError)) {
      next(cause);

      return;
    }

    if (cause.status === UNAUTHORISED) {
      response.setHeader('WWW-Authenticate', 'Bearer realm="sandbox-bank"');
    }

    response.status(cause.status).json({
      errors: [{ code: cause.code, title: cause.message, detail: cause.message }],
      meta: { totalRecords: 1, totalPages: 1, requestDateTime: clock.now().toISOString() },
    });
  };
}
