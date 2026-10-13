import type { Request, RequestHandler } from 'express';
import { readBearerToken } from '@shared/http/bearer-token.js';
import type {
  AccessTokenIntrospection,
  TokenHolder,
} from '../application/access-token-introspection.js';
import { sandboxBankFailures } from '../application/sandbox-bank.failures.js';
import type { TokenScope } from '../domain/issued-token.js';

export interface BankTokenGuard {
  readonly middleware: RequestHandler;
  /** On whose behalf the request came. Only on routes behind `middleware`. */
  holderOf(request: Request): TokenHolder;
}

/**
 * The bearer check in front of every resource endpoint: a live access token of
 * this scope, or 401 with no further detail. The holder is kept against the
 * request, as `validate.ts` keeps parsed input, so the controller reads it
 * typed.
 */
export function bankTokenGuard(
  introspection: AccessTokenIntrospection,
  scope: TokenScope,
): BankTokenGuard {
  const holders = new WeakMap<Request, TokenHolder>();

  return {
    middleware: (request, _response, next) => {
      void introspection
        .holderOf(readBearerToken(request.headers.authorization), scope)
        .then((holder) => {
          if (holder === null) {
            next(sandboxBankFailures.unauthenticated());

            return;
          }

          holders.set(request, holder);
          next();
        })
        .catch((cause: unknown) => {
          next(cause);
        });
    },

    holderOf: (request) => {
      const holder = holders.get(request);

      if (holder === undefined) {
        throw new Error('Route is missing its bank token guard');
      }

      return holder;
    },
  };
}

/** A `CONSENTS` token is a client's; an `ACCOUNTS` token also names its consent. */
export function consentOf(holder: TokenHolder): string {
  if (holder.consentId === null) {
    throw new Error('An accounts-scope token always belongs to a consent');
  }

  return holder.consentId;
}
