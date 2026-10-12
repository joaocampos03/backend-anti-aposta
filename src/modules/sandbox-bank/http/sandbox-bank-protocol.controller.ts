import type { Request, RequestHandler } from 'express';
import type { Clock } from '@shared/application/clock.port.js';
import type { ValidatedBody, ValidatedInput } from '@shared/http/validate.js';
import type { CreateConsent } from '../application/create-consent.use-case.js';
import type { IssueToken } from '../application/issue-token.use-case.js';
import type { ListSharedAccounts } from '../application/list-shared-accounts.use-case.js';
import type { ListSharedTransactions } from '../application/list-shared-transactions.use-case.js';
import type { RevokeConsent } from '../application/revoke-consent.use-case.js';
import { consentOf, type BankTokenGuard } from './bank-token-guard.js';
import { readClientCredentials } from './client-credentials.js';
import { OpenFinanceWirePresenter } from './open-finance-wire.presenter.js';
import type {
  ConsentParams,
  CreateConsentBody,
  SharedAccountParams,
  SharedTransactionsQuery,
  TokenRequest,
} from './sandbox-bank.schemas.js';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

export interface SandboxBankProtocolUseCases {
  readonly issueToken: IssueToken;
  readonly createConsent: CreateConsent;
  readonly revokeConsent: RevokeConsent;
  readonly listSharedAccounts: ListSharedAccounts;
  readonly listSharedTransactions: ListSharedTransactions;
}

export interface SandboxBankProtocolInputs {
  readonly tokenRequest: ValidatedBody<TokenRequest>;
  readonly createConsentBody: ValidatedBody<CreateConsentBody>;
  readonly consentParams: ValidatedInput<ConsentParams>;
  readonly sharedAccountParams: ValidatedInput<SharedAccountParams>;
  readonly sharedTransactionsQuery: ValidatedInput<SharedTransactionsQuery>;
  readonly consentsToken: BankTokenGuard;
  readonly accountsToken: BankTokenGuard;
}

/** The Open Finance surface. Thin: read, execute, present. */
export class SandboxBankProtocolController {
  constructor(
    private readonly useCases: SandboxBankProtocolUseCases,
    private readonly inputs: SandboxBankProtocolInputs,
    private readonly clock: Clock,
  ) {}

  readonly token: RequestHandler = async (request, response, next) => {
    const body = this.inputs.tokenRequest.read(request);
    const credentials = readClientCredentials(request.headers.authorization, body);

    const result = await this.useCases.issueToken.execute({
      ...credentials,
      grantType: body.grant_type,
      code: body.code ?? null,
      redirectUri: body.redirect_uri ?? null,
      codeVerifier: body.code_verifier ?? null,
      refreshToken: body.refresh_token ?? null,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    // RFC 6749 §5.1: a token response is never cached.
    response.setHeader('Cache-Control', 'no-store');
    response.status(OK).json(OpenFinanceWirePresenter.token(result.value));
  };

  readonly createConsent: RequestHandler = async (request, response, next) => {
    const { data } = this.inputs.createConsentBody.read(request);

    const result = await this.useCases.createConsent.execute({
      clientId: this.inputs.consentsToken.holderOf(request).clientId,
      permissions: data.permissions,
      expiresAt: data.expirationDateTime,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    const selfUrl = `${urlOf(request)}/${OpenFinanceWirePresenter.consentUrn(result.value.consentId)}`;

    response
      .status(CREATED)
      .json(OpenFinanceWirePresenter.consent(result.value, selfUrl, this.now()));
  };

  readonly revokeConsent: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.revokeConsent.execute({
      clientId: this.inputs.consentsToken.holderOf(request).clientId,
      consentId: this.inputs.consentParams.read(request).consentId,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(NO_CONTENT).end();
  };

  readonly listAccounts: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.listSharedAccounts.execute({
      consentId: consentOf(this.inputs.accountsToken.holderOf(request)),
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(OpenFinanceWirePresenter.accounts(result.value, urlOf(request), this.now()));
  };

  readonly listTransactions: RequestHandler = async (request, response, next) => {
    const query = this.inputs.sharedTransactionsQuery.read(request);

    const result = await this.useCases.listSharedTransactions.execute({
      consentId: consentOf(this.inputs.accountsToken.holderOf(request)),
      accountId: this.inputs.sharedAccountParams.read(request).accountId,
      fromBookingDate: query.fromBookingDate ?? null,
      toBookingDate: query.toBookingDate ?? null,
      page: query.page,
      pageSize: query['page-size'],
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response
      .status(OK)
      .json(OpenFinanceWirePresenter.transactions(result.value, urlOf(request), this.now()));
  };

  private now(): string {
    return this.clock.now().toISOString();
  }
}

/** The specification's `links` are absolute. */
function urlOf(request: Request): string {
  return `${request.protocol}://${request.get('host') ?? 'localhost'}${request.originalUrl}`;
}
