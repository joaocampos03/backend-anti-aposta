import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { assertNever } from '@shared/domain/assert-never.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { AuthorisationCodeRepository } from '../domain/authorisation-code.repository.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { IssuedTokenRepository } from '../domain/issued-token.repository.js';
import type { IssuedTokenDto, IssueTokenInput } from './dto/protocol.dto.js';
import type { BankSecrets } from './ports/bank-secrets.port.js';
import type { ClientRegistry, RegisteredClient } from './ports/client-registry.port.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';
import type { TokenIssuance } from './token-issuance.js';

const MILLISECONDS_IN_A_SECOND = 1000;

export interface IssueTokenDependencies {
  readonly clients: ClientRegistry;
  readonly consents: ConsentRepository;
  readonly codes: AuthorisationCodeRepository;
  readonly tokens: IssuedTokenRepository;
  readonly issuance: TokenIssuance;
  readonly secrets: BankSecrets;
  readonly clock: Clock;
}

/**
 * `POST /token`: the three grants a DataRecipient uses.
 *
 * - `client_credentials` — a token that may create and revoke consents.
 * - `authorization_code` + PKCE — the customer said yes; exchange the code.
 * - `refresh_token` — rotated on every use; replaying a spent one revokes
 *   everything the consent ever issued, because only a thief replays.
 *
 * Every failure after client authentication answers `invalid_grant` and no
 * more: which check failed is not the caller's to learn.
 */
export class IssueToken implements UseCase<IssueTokenInput, IssuedTokenDto> {
  constructor(private readonly dependencies: IssueTokenDependencies) {}

  async execute(input: IssueTokenInput): Promise<Result<IssuedTokenDto, AppError>> {
    const client = this.dependencies.clients.authenticate(input.clientId, input.clientSecret);

    if (client === null) {
      return fail(sandboxBankFailures.invalidClient());
    }

    const now = this.dependencies.clock.now();

    switch (input.grantType) {
      case 'client_credentials':
        return ok(await this.consentsToken(client, now));
      case 'authorization_code':
        return await this.exchangeCode(client, input, now);
      case 'refresh_token':
        return await this.rotateRefreshToken(client, input, now);
      default:
        return assertNever(input.grantType);
    }
  }

  private async consentsToken(client: RegisteredClient, now: Date): Promise<IssuedTokenDto> {
    const access = await this.dependencies.issuance.access({
      clientId: client.clientId,
      scope: 'CONSENTS',
      consentId: null,
      moment: now,
    });

    return {
      accessToken: access.value,
      expiresInSeconds: secondsBetween(now, access.expiresAt),
      refreshToken: null,
      scope: 'consents',
      consentId: null,
    };
  }

  private async exchangeCode(
    client: RegisteredClient,
    input: IssueTokenInput,
    now: Date,
  ): Promise<Result<IssuedTokenDto, AppError>> {
    if (input.code === null || input.codeVerifier === null || input.redirectUri === null) {
      return fail(sandboxBankFailures.invalidTokenRequest());
    }

    const code = await this.dependencies.codes.findByFingerprint(
      this.dependencies.secrets.fingerprint(input.code),
    );
    const redeemed = code?.redeem({
      clientId: client.clientId,
      redirectUri: input.redirectUri,
      presentedChallenge: this.dependencies.secrets.challengeOf(input.codeVerifier),
      moment: now,
    });

    if (code === null || redeemed === undefined || !redeemed.ok) {
      return fail(sandboxBankFailures.invalidGrant());
    }

    await this.dependencies.codes.save(code);

    return await this.issueForConsent(client, redeemed.value, now);
  }

  private async rotateRefreshToken(
    client: RegisteredClient,
    input: IssueTokenInput,
    now: Date,
  ): Promise<Result<IssuedTokenDto, AppError>> {
    if (input.refreshToken === null) {
      return fail(sandboxBankFailures.invalidTokenRequest());
    }

    const presented = await this.dependencies.tokens.findByFingerprint(
      this.dependencies.secrets.fingerprint(input.refreshToken),
    );

    if (presented === null || presented.consentId === null || presented.kind !== 'REFRESH') {
      return fail(sandboxBankFailures.invalidGrant());
    }

    if (presented.revokedAt !== null) {
      await this.dependencies.tokens.revokeAllForConsent(presented.consentId, now);

      return fail(sandboxBankFailures.invalidGrant());
    }

    if (!presented.isRefreshableBy(client.clientId, now)) {
      return fail(sandboxBankFailures.invalidGrant());
    }

    presented.revoke(now);
    await this.dependencies.tokens.save(presented);

    return await this.issueForConsent(client, presented.consentId, now);
  }

  private async issueForConsent(
    client: RegisteredClient,
    consentId: UniqueEntityId,
    now: Date,
  ): Promise<Result<IssuedTokenDto, AppError>> {
    const consent = await this.activeConsent(client, consentId, now);

    if (consent === null) {
      return fail(sandboxBankFailures.invalidGrant());
    }

    const scope = { clientId: client.clientId, consentId: consent.id, moment: now };
    const access = await this.dependencies.issuance.access({ ...scope, scope: 'ACCOUNTS' });
    const refresh = await this.dependencies.issuance.refresh({
      ...scope,
      expiresAt: consent.expiresAt,
    });

    return ok({
      accessToken: access.value,
      expiresInSeconds: secondsBetween(now, access.expiresAt),
      refreshToken: refresh.value,
      scope: 'accounts',
      consentId: consent.id.value,
    });
  }

  private async activeConsent(
    client: RegisteredClient,
    consentId: UniqueEntityId,
    now: Date,
  ): Promise<Consent | null> {
    const consent = await this.dependencies.consents.findByIdAndClientId(
      consentId,
      client.clientId,
    );

    return consent !== null && consent.isActiveAt(now) ? consent : null;
  }
}

function secondsBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MILLISECONDS_IN_A_SECOND);
}
