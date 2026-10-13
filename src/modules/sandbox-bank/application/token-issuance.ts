import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { IssuedToken, type TokenKind, type TokenScope } from '../domain/issued-token.js';
import type { IssuedTokenRepository } from '../domain/issued-token.repository.js';
import type { BankSecrets } from './ports/bank-secrets.port.js';

/** Short enough that a leaked access token is worth little. */
export const ACCESS_TOKEN_LIFETIME_IN_MINUTES = 15;
const MILLISECONDS_IN_A_MINUTE = 60 * 1000;

export interface MintedToken {
  readonly value: string;
  readonly expiresAt: Date;
}

/**
 * Mints a token and keeps only its fingerprint. The value exists in exactly one
 * place after this returns: the response to the client that asked for it.
 */
export class TokenIssuance {
  constructor(
    private readonly tokens: IssuedTokenRepository,
    private readonly secrets: BankSecrets,
    private readonly idGenerator: IdGenerator,
  ) {}

  async access(input: {
    readonly clientId: string;
    readonly scope: TokenScope;
    readonly consentId: UniqueEntityId | null;
    readonly moment: Date;
  }): Promise<MintedToken> {
    const expiresAt = new Date(
      input.moment.getTime() + ACCESS_TOKEN_LIFETIME_IN_MINUTES * MILLISECONDS_IN_A_MINUTE,
    );

    return await this.mint({ ...input, kind: 'ACCESS', expiresAt });
  }

  /** A refresh token never outlives the consent it reads through. */
  async refresh(input: {
    readonly clientId: string;
    readonly consentId: UniqueEntityId;
    readonly expiresAt: Date;
    readonly moment: Date;
  }): Promise<MintedToken> {
    return await this.mint({ ...input, kind: 'REFRESH', scope: 'ACCOUNTS' });
  }

  private async mint(input: {
    readonly clientId: string;
    readonly kind: TokenKind;
    readonly scope: TokenScope;
    readonly consentId: UniqueEntityId | null;
    readonly expiresAt: Date;
    readonly moment: Date;
  }): Promise<MintedToken> {
    const value = this.secrets.mint();

    await this.tokens.save(
      IssuedToken.issue({
        id: this.idGenerator.generate(),
        tokenFingerprint: this.secrets.fingerprint(value),
        kind: input.kind,
        scope: input.scope,
        clientId: input.clientId,
        consentId: input.consentId,
        issuedAt: input.moment,
        expiresAt: input.expiresAt,
      }),
    );

    return { value, expiresAt: input.expiresAt };
  }
}
