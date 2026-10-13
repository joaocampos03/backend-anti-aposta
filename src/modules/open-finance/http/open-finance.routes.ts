import { Router, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { OPEN_FINANCE_MESSAGES } from '../application/open-finance.messages.js';
import type { DataHolderNoticeController } from './data-holder-notice.controller.js';
import type { OpenFinanceController } from './open-finance.controller.js';

export interface OpenFinanceRouteDependencies {
  readonly controller: OpenFinanceController;
  readonly noticeController: DataHolderNoticeController;
  /** HTTP Basic with the enrolment's credentials: the stand-in for the ecosystem's mTLS. */
  readonly requireDataHolder: RequestHandler;
  readonly validateDataHolderNotice: RequestHandler;
  readonly requireSession: RequestHandler;
  readonly validateListTransactionsQuery: RequestHandler;
  readonly validateMonthlySummaryQuery: RequestHandler;
  readonly validateConsentParams: RequestHandler;
  readonly validateAuthorisationCallback: RequestHandler;
  /** Each of these calls the DataHolder, so a script cannot hammer it through us. */
  readonly consentCommandRateLimits: readonly RequestHandler[];
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

  consentRoutes(router, dependencies);

  // The institution calls this, not a person: no session, its own credentials,
  // and no rate limit of ours — synchronising twice ingests nothing new.
  router.post(
    '/data-holder-notices',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.synchronisationUnavailable),
    dependencies.requireDataHolder,
    dependencies.validateDataHolderNotice,
    dependencies.noticeController.receive,
  );

  return router;
}

/**
 * The consent lifecycle. Commands that are not CRUD are sub-resources —
 * `.../authorisation`, `.../synchronisation`, `.../revocation` — never verbs.
 */
function consentRoutes(router: Router, dependencies: OpenFinanceRouteDependencies): void {
  router.get(
    '/consents/current',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.consentUnavailable),
    dependencies.requireSession,
    dependencies.controller.currentConsent,
  );

  router.post(
    '/consents',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.connectionUnavailable),
    dependencies.requireSession,
    ...dependencies.consentCommandRateLimits,
    dependencies.controller.requestConsent,
  );

  router.post(
    '/consents/:consentId/authorisation',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.connectionUnavailable),
    dependencies.requireSession,
    ...dependencies.consentCommandRateLimits,
    dependencies.validateConsentParams,
    dependencies.validateAuthorisationCallback,
    dependencies.controller.completeAuthorisation,
  );

  router.post(
    '/consents/:consentId/synchronisation',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.synchronisationUnavailable),
    dependencies.requireSession,
    ...dependencies.consentCommandRateLimits,
    dependencies.validateConsentParams,
    dependencies.controller.synchronise,
  );

  // No rate limit, on purpose: withdrawing consent must always be possible.
  router.post(
    '/consents/:consentId/revocation',
    internalErrorMessage(OPEN_FINANCE_MESSAGES.revocationUnavailable),
    dependencies.requireSession,
    dependencies.validateConsentParams,
    dependencies.controller.revoke,
  );
}
