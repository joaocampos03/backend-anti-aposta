import type { RequestHandler } from 'express';
import { callerOf } from '@shared/http/require-session.js';
import type { ValidatedInput } from '@shared/http/validate.js';
import type { ListConnectedAccounts } from '../application/list-connected-accounts.use-case.js';
import type { ListTransactions } from '../application/list-transactions.use-case.js';
import type { SummariseSpendByMonth } from '../application/summarise-spend-by-month.use-case.js';
import { OpenFinancePresenter } from './open-finance.presenter.js';
import type { ListTransactionsQuery, MonthlySummaryQuery } from './open-finance.schemas.js';

const OK = 200;

export interface OpenFinanceUseCases {
  readonly listTransactions: ListTransactions;
  readonly summariseSpendByMonth: SummariseSpendByMonth;
  readonly listConnectedAccounts: ListConnectedAccounts;
}

export interface OpenFinanceQueries {
  readonly listTransactions: ValidatedInput<ListTransactionsQuery>;
  readonly monthlySummary: ValidatedInput<MonthlySummaryQuery>;
}

export class OpenFinanceController {
  constructor(
    private readonly useCases: OpenFinanceUseCases,
    private readonly queries: OpenFinanceQueries,
  ) {}

  readonly listTransactions: RequestHandler = async (request, response, next) => {
    const query = this.queries.listTransactions.read(request);

    const result = await this.useCases.listTransactions.execute({
      userId: callerOf(response),
      type: query.type,
      period: query.period,
      accountId: query.accountId ?? null,
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
