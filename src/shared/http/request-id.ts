import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Every request carries an id, so a 500 can be traced to a log line without the
 * response ever revealing what went wrong.
 */
export const requestId: RequestHandler = (request, response, next) => {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const identifier = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

  request.headers[REQUEST_ID_HEADER] = identifier;
  response.locals.requestId = identifier;
  response.setHeader(REQUEST_ID_HEADER, identifier);

  next();
};

export function readRequestId(headers: Readonly<Record<string, unknown>>): string {
  const incoming = headers[REQUEST_ID_HEADER];

  return typeof incoming === 'string' ? incoming : randomUUID();
}
