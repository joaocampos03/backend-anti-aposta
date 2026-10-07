import { Router } from 'express';

const OK = 200;
const SERVICE_UNAVAILABLE = 503;

export interface HealthDependencies {
  /** Readiness touches Postgres; liveness touches nothing. */
  readonly isDatabaseReachable: () => Promise<boolean>;
}

/** Neither endpoint is behind auth, and neither returns internals. */
export function healthRoutes(dependencies: HealthDependencies): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.status(OK).json({ status: 'ok' });
  });

  router.get('/ready', async (_request, response) => {
    const reachable = await dependencies.isDatabaseReachable();

    response.status(reachable ? OK : SERVICE_UNAVAILABLE).json({
      status: reachable ? 'ready' : 'unavailable',
    });
  });

  return router;
}
