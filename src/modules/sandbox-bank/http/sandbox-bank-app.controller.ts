import type { RequestHandler } from 'express';
import { callerOf } from '@shared/http/require-session.js';
import type { ValidatedBody, ValidatedInput } from '@shared/http/validate.js';
import type { DecideAuthorisation } from '../application/decide-authorisation.use-case.js';
import type { DescribeAuthorisationRequest } from '../application/describe-authorisation-request.use-case.js';
import type { RecordLedgerEntryInput } from '../application/dto/bank-app.dto.js';
import type { ListBookableAccounts } from '../application/list-bookable-accounts.use-case.js';
import type { ListCustomerAccounts } from '../application/list-customer-accounts.use-case.js';
import type { RecordLedgerEntry } from '../application/record-ledger-entry.use-case.js';
import type {
  AuthorisationDecisionBody,
  AuthorisationQuery,
  CustomerAccountParams,
  CustomerLedgerParams,
  CustomerParams,
  LedgerEntryBody,
} from './sandbox-bank.schemas.js';
import { SandboxBankAppPresenter } from './sandbox-bank-app.presenter.js';

const OK = 200;
const CREATED = 201;

export interface SandboxBankAppUseCases {
  readonly describeAuthorisationRequest: DescribeAuthorisationRequest;
  readonly decideAuthorisation: DecideAuthorisation;
  readonly listCustomerAccounts: ListCustomerAccounts;
  readonly recordLedgerEntry: RecordLedgerEntry;
  readonly listBookableAccounts: ListBookableAccounts;
}

export interface SandboxBankAppInputs {
  readonly authorisationQuery: ValidatedInput<AuthorisationQuery>;
  readonly authorisationDecision: ValidatedBody<AuthorisationDecisionBody>;
  readonly customerAccountParams: ValidatedInput<CustomerAccountParams>;
  readonly ledgerEntryBody: ValidatedBody<LedgerEntryBody>;
  readonly customerParams: ValidatedInput<CustomerParams>;
  readonly customerLedgerParams: ValidatedInput<CustomerLedgerParams>;
}

/**
 * The bank's own screens. The customer is whoever the platform session says is
 * asking — the sandbox's stand-in for the bank's own login. These answer in
 * this API's usual envelope, because the frontend is their only caller.
 */
export class SandboxBankAppController {
  constructor(
    private readonly useCases: SandboxBankAppUseCases,
    private readonly inputs: SandboxBankAppInputs,
  ) {}

  readonly describeAuthorisation: RequestHandler = async (request, response, next) => {
    const query = this.inputs.authorisationQuery.read(request);

    const result = await this.useCases.describeAuthorisationRequest.execute({
      customerId: callerOf(response),
      clientId: query.client_id,
      redirectUri: query.redirect_uri,
      consentId: query.scope,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(SandboxBankAppPresenter.authorisationRequest(result.value));
  };

  readonly decideAuthorisation: RequestHandler = async (request, response, next) => {
    const body = this.inputs.authorisationDecision.read(request);

    const result = await this.useCases.decideAuthorisation.execute({
      customerId: callerOf(response),
      clientId: body.clientId,
      redirectUri: body.redirectUri,
      consentId: body.scope,
      state: body.state,
      codeChallenge: body.codeChallenge,
      decision: body.decision,
      accountIds: body.accountIds,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json({ redirectTo: result.value.redirectTo });
  };

  readonly listAccounts: RequestHandler = async (_request, response, next) => {
    const result = await this.useCases.listCustomerAccounts.execute({
      customerId: callerOf(response),
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(SandboxBankAppPresenter.accounts(result.value));
  };

  readonly recordLedgerEntry: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.recordLedgerEntry.execute(
      ledgerEntryInput(
        callerOf(response),
        this.inputs.customerAccountParams.read(request).accountId,
        this.inputs.ledgerEntryBody.read(request),
      ),
    );

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(CREATED).json(SandboxBankAppPresenter.ledgerEntry(result.value));
  };

  /** The demonstration console: somebody's accounts, by id, opening none. */
  readonly listBookableAccounts: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.listBookableAccounts.execute({
      customerId: this.inputs.customerParams.read(request).customerId,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(SandboxBankAppPresenter.accounts(result.value));
  };

  /** The demonstration console: books on somebody's account, named in the path. */
  readonly recordLedgerEntryFor: RequestHandler = async (request, response, next) => {
    const params = this.inputs.customerLedgerParams.read(request);

    const result = await this.useCases.recordLedgerEntry.execute(
      ledgerEntryInput(params.customerId, params.accountId, this.inputs.ledgerEntryBody.read(request)),
    );

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(CREATED).json(SandboxBankAppPresenter.ledgerEntry(result.value));
  };
}

function ledgerEntryInput(
  customerId: string,
  accountId: string,
  body: LedgerEntryBody,
): RecordLedgerEntryInput {
  return {
    customerId,
    accountId,
    amountInCents: body.amountInCents,
    transactionName: body.transactionName,
    type: body.type,
    status: body.status,
    bookedAt: body.bookedAt ?? null,
    merchantCategoryCode: body.merchantCategoryCode,
    payeeDocument: body.payeeDocument,
  };
}
