import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

export type TokenKind = 'ACCESS' | 'REFRESH';

/**
 * `CONSENTS` is the client-credentials scope that may create and revoke
 * consents; `ACCOUNTS` is bound to one authorised consent and reads what it
 * shares.
 */
export type TokenScope = 'CONSENTS' | 'ACCOUNTS';

interface IssuedTokenProperties {
  readonly tokenFingerprint: string;
  readonly kind: TokenKind;
  readonly scope: TokenScope;
  readonly clientId: string;
  /** Null for a client-credentials token, which belongs to no consent. */
  readonly consentId: UniqueEntityId | null;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

/**
 * An access or refresh token the bank has handed out, kept by fingerprint. It
 * means nothing outside this bank, and a stolen table row cannot be replayed.
 */
export class IssuedToken extends AggregateRoot {
  private properties: IssuedTokenProperties;

  private constructor(id: UniqueEntityId, properties: IssuedTokenProperties) {
    super(id);
    this.properties = properties;
  }

  static issue(
    input: { readonly id: UniqueEntityId } & Omit<IssuedTokenProperties, 'revokedAt'>,
  ): IssuedToken {
    const { id, ...properties } = input;

    return new IssuedToken(id, { ...properties, revokedAt: null });
  }

  static restore(id: UniqueEntityId, properties: IssuedTokenProperties): IssuedToken {
    return new IssuedToken(id, properties);
  }

  get tokenFingerprint(): string {
    return this.properties.tokenFingerprint;
  }

  get kind(): TokenKind {
    return this.properties.kind;
  }

  get scope(): TokenScope {
    return this.properties.scope;
  }

  get clientId(): string {
    return this.properties.clientId;
  }

  get consentId(): UniqueEntityId | null {
    return this.properties.consentId;
  }

  get issuedAt(): Date {
    return this.properties.issuedAt;
  }

  get expiresAt(): Date {
    return this.properties.expiresAt;
  }

  get revokedAt(): Date | null {
    return this.properties.revokedAt;
  }

  isUsableAt(moment: Date): boolean {
    return this.properties.revokedAt === null && moment < this.properties.expiresAt;
  }

  /** What a resource endpoint asks before it answers. */
  grantsAccessAt(scope: TokenScope, moment: Date): boolean {
    return (
      this.properties.kind === 'ACCESS' && this.properties.scope === scope && this.isUsableAt(moment)
    );
  }

  /** A refresh token is spent the moment it is used: rotation, not reuse. */
  isRefreshableBy(clientId: string, moment: Date): boolean {
    return (
      this.properties.kind === 'REFRESH' &&
      this.properties.clientId === clientId &&
      this.isUsableAt(moment)
    );
  }

  revoke(moment: Date): void {
    if (this.properties.revokedAt !== null) {
      return;
    }

    this.properties = { ...this.properties, revokedAt: moment };
  }
}
