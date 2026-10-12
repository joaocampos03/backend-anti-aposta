import type { ZodType } from 'zod';
import type { Clock } from '@shared/application/clock.port.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type {
  DataHolder,
  DataHolderFailure,
  DataHolderTokens,
  SharedAccount,
  SharedTransaction,
} from '../application/ports/data-holder.port.js';
import type { AccountKind } from '../domain/transaction-attributes.js';
import {
  accountsResponseSchema,
  bookingDateOf,
  consentResponseSchema,
  tokenResponseSchema,
  toSharedAccount,
  toSharedTransaction,
  transactionsResponseSchema,
} from './open-finance-brasil.wire.js';

/** How this platform is enrolled at the institution. */
export interface DataHolderConnection {
  /** The Open Finance surface, e.g. `http://localhost:3333/sandbox/open-finance/v2`. */
  readonly baseUrl: string;
  /** The institution's authorisation screen, where the browser is sent. */
  readonly authorisationScreenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Registered at the institution; the code is only ever sent here. */
  readonly redirectUri: string;
}

/** What the consent asks to read: the statement and nothing more. */
const PERMISSIONS = ['ACCOUNTS_READ', 'ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ'] as const;
const PAGE_SIZE = 1000;
/** A statement longer than this is a runaway loop rather than a statement. */
const MAXIMUM_PAGES = 50;
const REQUEST_TIMEOUT_IN_MILLISECONDS = 10_000;
const MILLISECONDS_IN_A_SECOND = 1000;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const FIRST_SERVER_ERROR = 500;

interface WireResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * `open-finance` talking to the sandbox bank exactly as it would talk to any
 * institution: over HTTP, with client credentials, PKCE and bearer tokens. That
 * both run in one process changes nothing here, which is the point.
 *
 * Tokens travel in headers and form bodies, never in a URL, and nothing here
 * logs.
 */
export class SandboxBankDataHolder implements DataHolder {
  constructor(
    private readonly connection: DataHolderConnection,
    private readonly clock: Clock,
  ) {}

  async createConsent(input: {
    readonly expiresAt: Date;
  }): Promise<Result<{ readonly externalConsentId: string }, DataHolderFailure>> {
    const token = await this.clientCredentialsToken();

    if (!token.ok) {
      return token;
    }

    const response = await this.send('/consents', {
      method: 'POST',
      headers: { ...bearer(token.value), 'content-type': 'application/json' },
      body: JSON.stringify({
        data: { permissions: PERMISSIONS, expirationDateTime: input.expiresAt.toISOString() },
      }),
    });

    return mapped(parsed(response, consentResponseSchema), (body) => ({
      externalConsentId: body.data.consentId,
    }));
  }

  authorisationUrl(input: {
    readonly externalConsentId: string;
    readonly state: string;
    readonly codeChallenge: string;
  }): string {
    const url = new URL(this.connection.authorisationScreenUrl);
    const query = {
      response_type: 'code',
      client_id: this.connection.clientId,
      redirect_uri: this.connection.redirectUri,
      scope: `openid accounts consent:${input.externalConsentId}`,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
    };

    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }

    return url.toString();
  }

  async exchangeCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<Result<DataHolderTokens, DataHolderFailure>> {
    return await this.consentTokens({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.connection.redirectUri,
      code_verifier: input.codeVerifier,
    });
  }

  async refresh(refreshToken: string): Promise<Result<DataHolderTokens, DataHolderFailure>> {
    return await this.consentTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async listAccounts(
    accessToken: string,
  ): Promise<Result<readonly SharedAccount[], DataHolderFailure>> {
    const response = await this.send('/accounts', { method: 'GET', headers: bearer(accessToken) });

    return mapped(parsed(response, accountsResponseSchema), (body) =>
      body.data.map(toSharedAccount),
    );
  }

  async listTransactions(input: {
    readonly accessToken: string;
    readonly account: { readonly externalId: string; readonly kind: AccountKind };
    readonly from: Date;
    readonly to: Date;
  }): Promise<Result<readonly SharedTransaction[], DataHolderFailure>> {
    const collected: SharedTransaction[] = [];

    for (let page = 1; page <= MAXIMUM_PAGES; page += 1) {
      const fetched = await this.transactionsPage(input, page);

      if (!fetched.ok) {
        return fetched;
      }

      collected.push(...fetched.value.data.map((row) => toSharedTransaction(row, input.account.kind)));

      if (page >= fetched.value.meta.totalPages) {
        return ok(collected);
      }
    }

    return fail('UNAVAILABLE');
  }

  async revokeConsent(externalConsentId: string): Promise<Result<void, DataHolderFailure>> {
    const token = await this.clientCredentialsToken();

    if (!token.ok) {
      return token;
    }

    const response = await this.send(`/consents/${encodeURIComponent(externalConsentId)}`, {
      method: 'DELETE',
      headers: bearer(token.value),
    });

    // Already gone at the institution is the outcome we wanted.
    if (response.ok && (response.value.status === NO_CONTENT || response.value.status === NOT_FOUND)) {
      return ok(undefined);
    }

    return fail(response.ok ? failureFor(response.value.status) : response.error);
  }

  private async transactionsPage(
    input: {
      readonly accessToken: string;
      readonly account: { readonly externalId: string };
      readonly from: Date;
      readonly to: Date;
    },
    page: number,
  ) {
    const query = new URLSearchParams({
      fromBookingDate: bookingDateOf(input.from),
      toBookingDate: bookingDateOf(input.to),
      page: String(page),
      'page-size': String(PAGE_SIZE),
    });
    const path = `/accounts/${encodeURIComponent(input.account.externalId)}/transactions?${query.toString()}`;

    return parsed(
      await this.send(path, { method: 'GET', headers: bearer(input.accessToken) }),
      transactionsResponseSchema,
    );
  }

  private async clientCredentialsToken(): Promise<Result<string, DataHolderFailure>> {
    const response = await this.tokenRequest({ grant_type: 'client_credentials' });

    return mapped(parsed(response, tokenResponseSchema), (body) => body.access_token);
  }

  private async consentTokens(
    parameters: Readonly<Record<string, string>>,
  ): Promise<Result<DataHolderTokens, DataHolderFailure>> {
    const requestedAt = this.clock.now();
    const body = parsed(await this.tokenRequest(parameters), tokenResponseSchema);

    if (!body.ok) {
      return body;
    }

    if (body.value.refresh_token === undefined) {
      return fail('UNAVAILABLE');
    }

    return ok({
      accessToken: body.value.access_token,
      refreshToken: body.value.refresh_token,
      accessTokenExpiresAt: new Date(
        requestedAt.getTime() + body.value.expires_in * MILLISECONDS_IN_A_SECOND,
      ),
    });
  }

  /** RFC 6749: form-encoded, client authenticated with HTTP Basic. */
  private async tokenRequest(
    parameters: Readonly<Record<string, string>>,
  ): Promise<Result<WireResponse, DataHolderFailure>> {
    const credentials = Buffer.from(
      `${encodeURIComponent(this.connection.clientId)}:${encodeURIComponent(this.connection.clientSecret)}`,
    ).toString('base64');

    return await this.send('/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${credentials}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(parameters).toString(),
    });
  }

  private async send(path: string, init: RequestInit): Promise<Result<WireResponse, DataHolderFailure>> {
    try {
      const response = await fetch(`${this.connection.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS),
      });
      const text = await response.text();
      const body: unknown = text.length === 0 ? null : JSON.parse(text);

      return ok({ status: response.status, body });
    } catch {
      // Unreachable, timed out, or not JSON: in every case the institution did
      // not answer in a way we can act on, and the caller reports exactly that.
      return fail('UNAVAILABLE');
    }
  }
}

function bearer(token: string): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${token}` };
}

/** 4xx is the institution saying no; anything else is it not answering. */
function failureFor(status: number): DataHolderFailure {
  return status >= 400 && status < FIRST_SERVER_ERROR ? 'REFUSED' : 'UNAVAILABLE';
}

function parsed<TBody>(
  response: Result<WireResponse, DataHolderFailure>,
  schema: ZodType<TBody>,
): Result<TBody, DataHolderFailure> {
  if (!response.ok) {
    return response;
  }

  const { status, body } = response.value;

  if (status < 200 || status >= 300) {
    return fail(failureFor(status));
  }

  const result = schema.safeParse(body);

  return result.success ? ok(result.data) : fail('UNAVAILABLE');
}

function mapped<TFrom, TTo>(
  result: Result<TFrom, DataHolderFailure>,
  transform: (value: TFrom) => TTo,
): Result<TTo, DataHolderFailure> {
  return result.ok ? ok(transform(result.value)) : result;
}
