import type { RequestHandler } from 'express';

/** Declares the Portuguese sentence the funnel shows if this route throws. */
export function internalErrorMessage(message: string): RequestHandler {
  return (_request, response, next) => {
    response.locals.internalErrorMessage = message;

    next();
  };
}
