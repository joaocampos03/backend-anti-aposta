import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { OpenFinanceError } from './open-finance.errors.js';

/** Long enough to read the bank's screen and decide; short enough to be useless later. */
export const AUTHORISATION_REQUEST_LIFETIME_IN_MINUTES = 10;
const MILLISECONDS_IN_A_MINUTE = 60 * 1000;

interface AuthorisationRequestProperties {
  readonly userId: UniqueEntityId;
  /** The `state` sent to the DataHolder, as a fingerprint: it only has to be matched. */
  readonly stateFingerprint: string;
  /**
   * The PKCE verifier. It leaves this application exactly once, in the code
   * exchange, which is what proves the platform that started the flow is the
   * one finishing it. Encrypted at rest by the repository.
   */
  readonly codeVerifier: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/**
 * One OAuth round trip in flight, keyed by the consent it is for. It exists from
 * the moment the person is sent to the DataHolder until the callback arrives.
 *
 * A callback whose `state` does not match records nothing — it is either a
 * forged redirect or somebody else's, and in neither case is there anything to
 * learn from it.
 */
export class AuthorisationRequest extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: AuthorisationRequestProperties,
  ) {
    super(id);
  }

  static open(input: {
    readonly consentId: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly stateFingerprint: string;
    readonly codeVerifier: string;
    readonly createdAt: Date;
  }): AuthorisationRequest {
    const { consentId, ...properties } = input;

    return new AuthorisationRequest(consentId, {
      ...properties,
      expiresAt: new Date(
        input.createdAt.getTime() +
          AUTHORISATION_REQUEST_LIFETIME_IN_MINUTES * MILLISECONDS_IN_A_MINUTE,
      ),
    });
  }

  static restore(
    consentId: UniqueEntityId,
    properties: AuthorisationRequestProperties,
  ): AuthorisationRequest {
    return new AuthorisationRequest(consentId, properties);
  }

  get consentId(): UniqueEntityId {
    return this.id;
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get stateFingerprint(): string {
    return this.properties.stateFingerprint;
  }

  get codeVerifier(): string {
    return this.properties.codeVerifier;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }

  get expiresAt(): Date {
    return this.properties.expiresAt;
  }

  /** Checks the callback is the one this request is waiting for. */
  verify(
    presentedStateFingerprint: string,
    moment: Date,
  ): Result<void, OpenFinanceError<'AUTHORISATION_STATE_MISMATCH' | 'AUTHORISATION_EXPIRED'>> {
    if (presentedStateFingerprint !== this.properties.stateFingerprint) {
      return fail(OpenFinanceError.authorisationStateMismatch());
    }

    if (moment >= this.properties.expiresAt) {
      return fail(OpenFinanceError.authorisationExpired());
    }

    return ok(undefined);
  }
}
