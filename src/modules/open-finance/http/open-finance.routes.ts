import { Router, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { OPEN_FINANCE_MESSAGES } from '../application/open-finance.messages.js';
import type { OpenFinanceController } from './open-finance.controller.js';

export interface OpenFinanceRouteDependencies {
  readonly controller: OpenFinanceController;
  readonly requireSession: RequestHandler;
  readonly validateListTransactionsQuery: RequestHandler;
  readonly validateMonthlySummaryQuery: RequestHandler;
}

/** One route, one use case. Every one of them is scoped to the caller. */
export function openFinanceRoutes(dependencies: OpenFinanceRouteDependencies): Router {
  const router = Router();

  router.get(
    '/transactions',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.transactionsUnavailable),
    dependencies.requireSession,
    dependencies.validateListTransactionsQuery,
    dependencies.controller.listTransactions,
  );

  router.get(
    '/transactions/monthly-summary',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.chartsUnavailable),
    dependencies.requireSession,
    dependencies.validateMonthlySummaryQuery,
    dependencies.controller.monthlySummary,
  );

  router.get(
    '/accounts',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.accountsUnavailable),
    dependencies.requireSession,
    dependencies.controller.listAccounts,
  );

  return router;
}
