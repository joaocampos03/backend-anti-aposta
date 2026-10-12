import { Router, type RequestHandler } from 'express';
import type { AwarenessController } from './awareness.controller.js';

export interface AwarenessRouteDependencies {
  readonly controller: AwarenessController;
  readonly requireSession: RequestHandler;
}

export function awarenessRoutes(dependencies: AwarenessRouteDependencies): Router {
  const router = Router();

  // No `internalErrorMessage`: a failure here renders nothing rather than an
  // error. A broken support card must not become an alarming message, and the
  // contacts are permanently available in the footer and the auth layout.
  router.get(
    '/awareness/support-offer',
    dependencies.requireSession,
    dependencies.controller.supportOffer,
  );

  return router;
}
