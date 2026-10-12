import type { Request, RequestHandler } from 'express';
import type { ZodError, ZodIssue, ZodType } from 'zod';
import type { AppError, AppErrorDetails } from '../application/app-error.js';

export interface ValidatedInput<TValue> {
  /** Parses once, before the controller runs. */
  readonly middleware: RequestHandler;
  /** The only way a controller reads request input. */
  read(request: Request): TValue;
}

export interface ValidatedBody<TValue> {
  /** Parses once, before the controller runs. */
  readonly middleware: RequestHandler;
  /** The only way a controller reads request input. */
  read(request: Request): TValue;
}

/** One entry per offending field, which is where the message is rendered. */
function fieldsOf(issue: ZodIssue): readonly string[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys;
  }

  return [issue.path.length > 0 ? issue.path.join('.') : 'body'];
}

function detailsFrom(error: ZodError): AppErrorDetails {
  const details: Record<string, string> = {};

  for (const issue of error.issues) {
    for (const field of fieldsOf(issue)) {
      details[field] = issue.message;
    }
  }

  return details;
}

/**
 * Validation happens once, here, and the controller never touches
 * `request.body`. The parsed value is held against the request itself, so what
 * the controller reads is typed by the schema instead of asserted by a cast.
 */
export function validateBody<TValue>(
  schema: ZodType<TValue>,
  onInvalid: (details: AppErrorDetails) => AppError,
): ValidatedBody<TValue> {
  const parsedBodies = new WeakMap<Request, TValue>();

  return {
    middleware: (request, _response, next) => {
      const parsed = schema.safeParse(request.body);

      if (!parsed.success) {
        next(onInvalid(detailsFrom(parsed.error)));

        return;
      }

      parsedBodies.set(request, parsed.data);
      next();
    },

    read: (request) => {
      const parsed = parsedBodies.get(request);

      if (parsed === undefined) {
        throw new Error('Route is missing its validate middleware');
      }

      return parsed;
    },
  };
}

/**
 * The same contract for the query string. The delivery layer of the frontend
 * normalises a bad query before calling, so a failure here is a bug on that
 * side rather than something a person typed.
 */
export function validateQuery<TValue>(
  schema: ZodType<TValue>,
  onInvalid: (details: AppErrorDetails) => AppError,
): ValidatedInput<TValue> {
  const parsedQueries = new WeakMap<Request, TValue>();

  return {
    middleware: (request, _response, next) => {
      const parsed = schema.safeParse(request.query);

      if (!parsed.success) {
        next(onInvalid(detailsFrom(parsed.error)));

        return;
      }

      parsedQueries.set(request, parsed.data);
      next();
    },

    read: (request) => {
      const parsed = parsedQueries.get(request);

      if (parsed === undefined) {
        throw new Error('Route is missing its validate middleware');
      }

      return parsed;
    },
  };
}

/** The same contract for path parameters, which Express types loosely. */
export function validateParams<TValue>(
  schema: ZodType<TValue>,
  onInvalid: (details: AppErrorDetails) => AppError,
): ValidatedInput<TValue> {
  const parsedParams = new WeakMap<Request, TValue>();

  return {
    middleware: (request, _response, next) => {
      const parsed = schema.safeParse(request.params);

      if (!parsed.success) {
        next(onInvalid(detailsFrom(parsed.error)));

        return;
      }

      parsedParams.set(request, parsed.data);
      next();
    },

    read: (request) => {
      const parsed = parsedParams.get(request);

      if (parsed === undefined) {
        throw new Error('Route is missing its validate middleware');
      }

      return parsed;
    },
  };
}
