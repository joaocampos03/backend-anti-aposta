import { pino } from 'pino';
import { env } from './env.js';

/**
 * Structured JSON, no PII. Headers, body and the caller's address are removed at
 * the logger rather than at the call site, so a new route cannot forget: no
 * e-mail, no name, no token and no transaction description ever reaches a log
 * line. What correlates a request is its id.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers', 'res.headers', 'req.body', 'req.remoteAddress', 'req.remotePort'],
    remove: true,
  },
  base: null,
});

export type Logger = typeof logger;
