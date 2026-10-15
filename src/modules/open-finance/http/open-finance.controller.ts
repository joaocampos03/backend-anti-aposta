import type { RequestHandler } from 'express';
import { callerOf } from '@shared/http/require-session.js';
import type { ValidatedBody, ValidatedInput } from '@shared/http/validate.js';
import type { CompleteAuthorisation } from '../application/complete-authorisation.use-case.js';
import type { GetCurrentConsent } from '../application/get-current-consent.use-case.js';
import type { ListConnectedAccounts } from '../application/list-connected-accounts.use-case.js';
import type { ListTransactions } from '../application/list-transactions.use-case.js';
import type { RequestConsent } from '../application/request-consent.use-case.js';
import type { RevokeConsent } from '../application/revoke-consent.use-case.js';
import type { SummariseSpendByMonth } from '../application/summarise-spend-by-month.use-case.js';
import type { SynchroniseConsent } from '../application/synchronise-consent.use-case.js';
import { OpenFinancePresenter } from './open-finance.presenter.js';
import type {
  AuthorisationCallbackBody,
  ConsentParams,
  ListTransactionsQuery,
  MonthlySummaryQuery,
} from './open-finance.schemas.js';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

export interface OpenFinanceUseCases {
  readonly listTransactions: ListTransactions;
  readonly summariseSpendByMonth: SummariseSpendByMonth;
  readonly listConnectedAccounts: ListConnectedAccounts;
  readonly requestConsent: RequestConsent;
  readonly completeAuthorisation: CompleteAuthorisation;
  readonly synchroniseConsent: SynchroniseConsent;
  readonly revokeConsent: RevokeConsent;
  readonly getCurrentConsent: GetCurrentConsent;
}

export interface OpenFinanceQueries {
  readonly listTransactions: ValidatedInput<ListTransactionsQuery>;
  readonly monthlySummary: ValidatedInput<MonthlySummaryQuery>;
  readonly consentParams: ValidatedInput<ConsentParams>;
  readonly authorisationCallback: ValidatedBody<AuthorisationCallbackBody>;
}

export class OpenFinanceController {
  constructor(
    private readonly useCases: OpenFinanceUseCases,
    private readonly queries: OpenFinanceQueries,
  ) {}

  readonly currentConsent: RequestHandler = async (_request, response, next) => {
    const result = await this.useCases.getCurrentConsent.execute({ userId: callerOf(response) });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(OpenFinancePresenter.currentConsent(result.value));
  };

  readonly requestConsent: RequestHandler = async (_request, response, next) => {
    const result = await this.useCases.requestConsent.execute({ userId: callerOf(response) });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(CREATED).json(OpenFinancePresenter.requestedConsent(result.value));
  };

  readonly completeAuthorisation: RequestHandler = async (request, response, next) => {
    const body = this.queries.authorisationCallback.read(request);

    const result = await this.useCases.completeAuthorisation.execute({
      userId: callerOf(response),
      consentId: this.queries.consentParams.read(request).consentId,
      state: body.state,
      code: 'code' in body ? body.code : null,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(OpenFinancePresenter.synchronisation(result.value));
  };

  readonly synchronise: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.synchroniseConsent.execute({
      userId: callerOf(response),
      consentId: this.queries.consentParams.read(request).consentId,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(OpenFinancePresenter.synchronisation(result.value));
  };

  readonly revoke: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.revokeConsent.execute({
      userId: callerOf(response),
      consentId: this.queries.consentParams.read(request).consentId,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(NO_CONTENT).end();
  };

  readonly listTransactions: RequestHandler = async (request, response, next) => {
    const query = this.queries.listTransactions.read(request);

    const result = await this.useCases.listTransactions.execute({
      userId: callerOf(response),
      type: query.type,
      period: query.period,
      accountId: query.accountId ?? null,
      bookmakerId: query.bookmakerId ?? null,
      search: query.q ?? null,
      limit: query.limit,
      cursor: query.cursor ?? null,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(OpenFinancePresenter.ledger(result.value));
  };

  readonly monthlySummary: RequestHandler = async (request, response, next) => {
    const query = this.queries.monthlySummary.read(request);

    const result = await this.useCases.summariseSpendByMonth.execute({
      userId: callerOf(response),
      months: query.months,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(OpenFinancePresenter.monthlySummary(result.value));
  };

  readonly listAccounts: RequestHandler = async (_request, response, next) => {
    const result = await this.useCases.listConnectedAccounts.execute({
      userId: callerOf(response),
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(OpenFinancePresenter.accounts(result.value));
  };
}
