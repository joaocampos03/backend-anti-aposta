import type { RequestHandler, Response } from 'express';
import type { AppError } from '../application/app-error.js';
import type { Result } from '../domain/result.js';
import { readBearerToken } from './bearer-token.js';

export interface Caller {
  readonly userId: string;
}

/** Implemented by `identity`, which owns the question "who is asking". */
export interface CallerResolver {
  resolve(token: string): Promise<Result<Caller, AppError>>;
}

/**
 * Turns the session token into a caller, or refuses the request before the
 * route sees it.
 *
 * Every endpoint behind it is scoped by that caller. A query by id alone is a
 * bug in this codebase: "not yours" answers 404 rather than confirming that
 * somebody else's data exists.
 */
export function requireSession(resolver: CallerResolver): RequestHandler {
  return (request, response, next) => {
    void resolver
      .resolve(readBearerToken(request.headers.authorization))
      .then((resolved) => {
        if (!resolved.ok) {
          next(resolved.error);

          return;
        }

        response.locals.userId = resolved.value.userId;
        next();
      })
      .catch((cause: unknown) => {
        next(cause);
      });
  };
}

/**
 * The caller a route behind `requireSession` is guaranteed to have. Its absence
 * is a wiring mistake rather than a request the user could make.
 */
export function callerOf(response: Response): string {
  const userId = response.locals.userId;

  if (userId === undefined) {
    throw new Error('Route is missing its requireSession middleware');
  }

  return userId;
}
