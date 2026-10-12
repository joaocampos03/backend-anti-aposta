import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { SandboxBankError } from './sandbox-bank.errors.js';

/** RFC 6749 recommends ten minutes at most; a person has already said yes. */
export const AUTHORISATION_CODE_LIFETIME_IN_MINUTES = 5;
const MILLISECONDS_IN_A_MINUTE = 60 * 1000;

interface AuthorisationCodeProperties {
  /** Only the fingerprint: a leaked row cannot be redeemed. */
  readonly codeFingerprint: string;
  readonly consentId: UniqueEntityId;
  readonly clientId: string;
  readonly redirectUri: string;
  /** PKCE S256: the hash of a verifier only the requesting client holds. */
  readonly codeChallenge: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly redeemedAt: Date | null;
}

/**
 * What the customer's "yes" turns into: a single-use code, minutes long, bound
 * to the client that asked, the redirect it named and the PKCE challenge it
 * sent. Any mismatch answers the same `INVALID_GRANT` — the reason is not the
 * caller's to learn.
 */
export class AuthorisationCode extends AggregateRoot {
  private properties: AuthorisationCodeProperties;

  private constructor(id: UniqueEntityId, properties: AuthorisationCodeProperties) {
    super(id);
    this.properties = properties;
  }

  static issue(input: {
    readonly id: UniqueEntityId;
    readonly codeFingerprint: string;
    readonly consentId: UniqueEntityId;
    readonly clientId: string;
    readonly redirectUri: string;
    readonly codeChallenge: string;
    readonly issuedAt: Date;
  }): AuthorisationCode {
    const { id, ...properties } = input;

    return new AuthorisationCode(id, {
      ...properties,
      expiresAt: new Date(
        input.issuedAt.getTime() + AUTHORISATION_CODE_LIFETIME_IN_MINUTES * MILLISECONDS_IN_A_MINUTE,
      ),
      redeemedAt: null,
    });
  }

  static restore(id: UniqueEntityId, properties: AuthorisationCodeProperties): AuthorisationCode {
    return new AuthorisationCode(id, properties);
  }

  get codeFingerprint(): string {
    return this.properties.codeFingerprint;
  }

  get consentId(): UniqueEntityId {
    return this.properties.consentId;
  }

  get clientId(): string {
    return this.properties.clientId;
  }

  get redirectUri(): string {
    return this.properties.redirectUri;
  }

  get codeChallenge(): string {
    return this.properties.codeChallenge;
  }

  get issuedAt(): Date {
    return this.properties.issuedAt;
  }

  get expiresAt(): Date {
    return this.properties.expiresAt;
  }

  get redeemedAt(): Date | null {
    return this.properties.redeemedAt;
  }

  /**
   * Spends the code. `presentedChallenge` is the S256 of the verifier the client
   * sent now; it has to match the challenge it sent before the customer was
   * asked, which is what proves the same client is on both ends.
   */
  redeem(input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly presentedChallenge: string;
    readonly moment: Date;
  }): Result<UniqueEntityId, SandboxBankError<'INVALID_GRANT'>> {
    if (!this.isRedeemableBy(input)) {
      return fail(SandboxBankError.invalidGrant());
    }

    this.properties = { ...this.properties, redeemedAt: input.moment };

    return ok(this.properties.consentId);
  }

  private isRedeemableBy(input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly presentedChallenge: string;
    readonly moment: Date;
  }): boolean {
    return (
      this.properties.redeemedAt === null &&
      input.moment < this.properties.expiresAt &&
      input.clientId === this.properties.clientId &&
      input.redirectUri === this.properties.redirectUri &&
      input.presentedChallenge === this.properties.codeChallenge
    );
  }
}
