import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { openFinanceFailures } from '../application/open-finance.failures.js';

const BASIC_PREFIX = 'Basic ';
const SEPARATOR = ':';

/** The enrolment both sides share: the platform's client id and secret at the institution. */
export interface DataHolderEnrolment {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * Only the institution may tell the platform that a consent changed. In Open
 * Finance Brasil that call is authenticated with mutual TLS and ICP-Brasil
 * certificates, which this project cannot obtain; the stand-in is the
 * enrolment's own credentials over HTTP Basic, compared in constant time.
 *
 * A wrong credential and a missing one answer the same `401`.
 */
export function requireDataHolder(enrolment: DataHolderEnrolment): RequestHandler {
  const expected = digestOf(`${enrolment.clientId}${SEPARATOR}${enrolment.clientSecret}`);

  return (request, _response, next) => {
    const presented = digestOf(basicCredentialsOf(request.headers.authorization));

    if (!timingSafeEqual(presented, expected)) {
      next(openFinanceFailures.dataHolderNotRecognised());

      return;
    }

    next();
  };
}

function basicCredentialsOf(authorization: string | undefined): string {
  if (authorization?.startsWith(BASIC_PREFIX) !== true) {
    return '';
  }

  return Buffer.from(authorization.slice(BASIC_PREFIX.length).trim(), 'base64').toString('utf8');
}

function digestOf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
