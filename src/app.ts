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

const API_PREFIX = '/api/v1';
const JSON_BODY_LIMIT = '100kb';

export interface AppDependencies {
  readonly logger: Logger;
  readonly frontendOrigin: string;
  readonly health: HealthDependencies;
  readonly identity: IdentityRouteDependencies;
}

/** Middleware order is part of the contract, and the funnel is always last. */
export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: dependencies.frontendOrigin, credentials: true }));
  app.use(requestId);
  app.use(requestLogging);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use(healthRoutes(dependencies.health));
  app.use(API_PREFIX, identityRoutes(dependencies.identity));

  app.use(notFound);
  app.use(errorHandler(dependencies.logger));

  return app;
}
