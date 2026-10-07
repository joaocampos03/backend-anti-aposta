import { pinoHttp } from 'pino-http';
import { logger } from '../infrastructure/logger.js';
import { readRequestId } from './request-id.js';

/**
 * Structured request logs with no PII: the logger redacts `authorization`,
 * `cookie`, `set-cookie` and the body, and these routes carry nothing
 * identifying in their paths.
 */
export const requestLogging = pinoHttp({
  logger,
  genReqId: (request) => readRequestId(request.headers),
});
