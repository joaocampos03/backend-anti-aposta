import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { internalErrorMessage } from '@shared/http/internal-error-message.js';
import { SANDBOX_BANK_MESSAGES } from '../application/sandbox-bank.messages.js';
import { oauthErrorEnvelope } from './protocol-error-envelopes.js';
import type { SandboxBankAppController } from './sandbox-bank-app.controller.js';
import type { SandboxBankProtocolController } from './sandbox-bank-protocol.controller.js';

/** Mounted under `/sandbox`: outside `/api/v1`, because this is another institution. */
export const OPEN_FINANCE_PREFIX = '/open-finance/v2';
const BANK_APP_PREFIX = '/bank';
const TOKEN_BODY_LIMIT = '10kb';

export interface SandboxBankRouteDependencies {
  readonly protocol: SandboxBankProtocolController;
  readonly app: SandboxBankAppController;
  readonly requireSession: RequestHandler;
  readonly validateTokenRequest: RequestHandler;
  readonly validateCreateConsentBody: RequestHandler;
  readonly validateConsentParams: RequestHandler;
  readonly validateSharedAccountParams: RequestHandler;
  readonly validateSharedTransactionsQuery: RequestHandler;
  readonly requireConsentsToken: RequestHandler;
  readonly requireAccountsToken: RequestHandler;
  readonly openFinanceErrors: ErrorRequestHandler;
  readonly validateAuthorisationQuery: RequestHandler;
  readonly validateAuthorisationDecision: RequestHandler;
  readonly validateCustomerAccountParams: RequestHandler;
  readonly validateLedgerEntryBody: RequestHandler;
  readonly validateCustomerParams: RequestHandler;
  readonly validateCustomerLedgerParams: RequestHandler;
  /**
   * The ledger write, or `null` where booking entries is switched off — in
   * production, always. A route that is not mounted cannot be misused.
   */
  readonly ledgerWriteRateLimits: readonly RequestHandler[] | null;
}

/**
 * Three routers, because they answer in three dialects: OAuth's on the token
 * endpoint, Open Finance Brasil's on the resources, and this API's own on the
 * bank's screens, which only the frontend calls.
 */
export function sandboxBankRoutes(dependencies: SandboxBankRouteDependencies): Router {
  const router = Router();

  router.use(tokenRouter(dependencies));
  router.use(resourceRouter(dependencies));
  router.use(bankAppRouter(dependencies));

  return router;
}

function tokenRouter(dependencies: SandboxBankRouteDependencies): Router {
  const router = Router();

  router.post(
    `${OPEN_FINANCE_PREFIX}/token`,
    internalErrorMessage(SANDBOX_BANK_MESSAGES.protocolUnavailable),
    express.urlencoded({ extended: false, limit: TOKEN_BODY_LIMIT }),
    dependencies.validateTokenRequest,
    dependencies.protocol.token,
  );
  router.use(oauthErrorEnvelope);

  return router;
}

function resourceRouter(dependencies: SandboxBankRouteDependencies): Router {
  const router = Router();
  const unavailable = internalErrorMessage(SANDBOX_BANK_MESSAGES.protocolUnavailable);

  router.post(
    `${OPEN_FINANCE_PREFIX}/consents`,
    unavailable,
    dependencies.requireConsentsToken,
    dependencies.validateCreateConsentBody,
    dependencies.protocol.createConsent,
  );

  router.delete(
    `${OPEN_FINANCE_PREFIX}/consents/:consentId`,
    unavailable,
    dependencies.requireConsentsToken,
    dependencies.validateConsentParams,
    dependencies.protocol.revokeConsent,
  );

  router.get(
    `${OPEN_FINANCE_PREFIX}/accounts`,
    unavailable,
    dependencies.requireAccountsToken,
    dependencies.protocol.listAccounts,
  );

  router.get(
    `${OPEN_FINANCE_PREFIX}/accounts/:accountId/transactions`,
    unavailable,
    dependencies.requireAccountsToken,
    dependencies.validateSharedAccountParams,
    dependencies.validateSharedTransactionsQuery,
    dependencies.protocol.listTransactions,
  );

  router.use(dependencies.openFinanceErrors);

  return router;
}

function bankAppRouter(dependencies: SandboxBankRouteDependencies): Router {
  const router = Router();

  router.get(
    `${OPEN_FINANCE_PREFIX}/authorize`,
    internalErrorMessage(SANDBOX_BANK_MESSAGES.authorisationUnavailable),
    dependencies.requireSession,
    dependencies.validateAuthorisationQuery,
    dependencies.app.describeAuthorisation,
  );

  router.post(
    `${OPEN_FINANCE_PREFIX}/authorize`,
    internalErrorMessage(SANDBOX_BANK_MESSAGES.authorisationUnavailable),
    dependencies.requireSession,
    dependencies.validateAuthorisationDecision,
    dependencies.app.decideAuthorisation,
  );

  router.get(
    `${BANK_APP_PREFIX}/accounts`,
    internalErrorMessage(SANDBOX_BANK_MESSAGES.authorisationUnavailable),
    dependencies.requireSession,
    dependencies.app.listAccounts,
  );

  if (dependencies.ledgerWriteRateLimits !== null) {
    router.post(
      `${BANK_APP_PREFIX}/accounts/:accountId/ledger-entries`,
      internalErrorMessage(SANDBOX_BANK_MESSAGES.ledgerUnavailable),
      dependencies.requireSession,
      ...dependencies.ledgerWriteRateLimits,
      dependencies.validateCustomerAccountParams,
      dependencies.validateLedgerEntryBody,
      dependencies.app.recordLedgerEntry,
    );

    customerLedgerRoutes(router, dependencies, dependencies.ledgerWriteRateLimits);
  }

  return router;
}

/**
 * The demonstration console books for somebody else, named by id in the path:
 * the presenter types a movement and the other person's screen updates. Same
 * switch as the self-service write — never mounted in production.
 */
function customerLedgerRoutes(
  router: Router,
  dependencies: SandboxBankRouteDependencies,
  rateLimits: readonly RequestHandler[],
): void {
  router.get(
    `${BANK_APP_PREFIX}/customers/:customerId/accounts`,
    internalErrorMessage(SANDBOX_BANK_MESSAGES.authorisationUnavailable),
    dependencies.requireSession,
    dependencies.validateCustomerParams,
    dependencies.app.listBookableAccounts,
  );

  router.post(
    `${BANK_APP_PREFIX}/customers/:customerId/accounts/:accountId/ledger-entries`,
    internalErrorMessage(SANDBOX_BANK_MESSAGES.ledgerUnavailable),
    dependencies.requireSession,
    ...rateLimits,
    dependencies.validateCustomerLedgerParams,
    dependencies.validateLedgerEntryBody,
    dependencies.app.recordLedgerEntryFor,
  );
}
