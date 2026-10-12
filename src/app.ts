import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from '@shared/infrastructure/logger.js';
import { errorHandler } from '@shared/http/error-handler.js';
import { healthRoutes, type HealthDependencies } from '@shared/http/health.routes.js';
import { notFound } from '@shared/http/not-found.js';
import { requestId } from '@shared/http/request-id.js';
import { requestLogging } from '@shared/http/request-logging.js';
import {
  identityRoutes,
  type IdentityRouteDependencies,
} from '@modules/identity/http/identity.routes.js';
import {
  awarenessRoutes,
  type AwarenessRouteDependencies,
} from '@modules/awareness/http/awareness.routes.js';
import {
  betDetectionRoutes,
  type BetDetectionRouteDependencies,
} from '@modules/bet-detection/http/bet-detection.routes.js';
import {
  openFinanceRoutes,
  type OpenFinanceRouteDependencies,
} from '@modules/open-finance/http/open-finance.routes.js';

const API_PREFIX = '/api/v1';
const JSON_BODY_LIMIT = '100kb';

export interface AppDependencies {
  readonly logger: Logger;
  readonly frontendOrigin: string;
  /**
   * Set before any middleware reads `request.ip`: the rate limits key on it, and
   * so does the error funnel's fingerprint.
   */
  readonly trustProxy: string | false;
  readonly health: HealthDependencies;
  readonly identity: IdentityRouteDependencies;
  readonly openFinance: OpenFinanceRouteDependencies;
  readonly betDetection: BetDetectionRouteDependencies;
  readonly awareness: AwarenessRouteDependencies;
}

/** Middleware order is part of the contract, and the funnel is always last. */
export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', dependencies.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: dependencies.frontendOrigin, credentials: true }));
  app.use(requestId);
  app.use(requestLogging);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use(healthRoutes(dependencies.health));
  app.use(API_PREFIX, identityRoutes(dependencies.identity));
  app.use(API_PREFIX, openFinanceRoutes(dependencies.openFinance));
  app.use(API_PREFIX, betDetectionRoutes(dependencies.betDetection));
  app.use(API_PREFIX, awarenessRoutes(dependencies.awareness));

  app.use(notFound);
  app.use(errorHandler(dependencies.logger));

  return app;
}
