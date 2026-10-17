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
import {
  sandboxBankRoutes,
  type SandboxBankRouteDependencies,
} from '@modules/sandbox-bank/http/sandbox-bank.routes.js';
import {
  gamificationRoutes,
  type GamificationRouteDependencies,
} from '@modules/gamification/http/gamification.routes.js';
import {
  notificationsRoutes,
  type NotificationsRouteDependencies,
} from '@modules/notifications/http/notifications.routes.js';

const API_PREFIX = '/api/v1';
/**
 * The simulated institution lives outside `/api/v1`: it is another system with
 * its own versioning (`/open-finance/v2`), which happens to share this process.
 */
const SANDBOX_PREFIX = '/sandbox';
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
  readonly sandboxBank: SandboxBankRouteDependencies;
  readonly gamification: GamificationRouteDependencies;
  readonly notifications: NotificationsRouteDependencies;
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
  app.use(API_PREFIX, gamificationRoutes(dependencies.gamification));
  app.use(API_PREFIX, notificationsRoutes(dependencies.notifications));
  app.use(SANDBOX_PREFIX, sandboxBankRoutes(dependencies.sandboxBank));

  app.use(notFound);
  app.use(errorHandler(dependencies.logger));

  return app;
}
