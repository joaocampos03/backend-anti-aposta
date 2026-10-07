/**
 * The LGPD authorisation taken at registration: the name and the e-mail, nothing
 * else. It is **not** the `Consent` aggregate of `open-finance` — different
 * scope, no expiry, no OAuth flow, no bank — and modelling the two as one thing
 * is the single most likely mistake in this feature.
 *
 * Its existence is the acceptance: there is no way to hold a
 * `RegistrationConsent` that was refused, and no way to hold a `User` without
 * one.
 */
export type RegistrationConsentScope = 'NAME_AND_EMAIL';

export const REGISTRATION_CONSENT_SCOPE: RegistrationConsentScope = 'NAME_AND_EMAIL';

export class RegistrationConsent {
  readonly scope: RegistrationConsentScope = REGISTRATION_CONSENT_SCOPE;

  private constructor(
    readonly acceptedAt: Date,
    readonly policyVersion: string,
  ) {}

  static accept(input: { readonly acceptedAt: Date; readonly policyVersion: string }): RegistrationConsent {
    if (input.policyVersion.length === 0) {
      throw new Error('RegistrationConsent requires a policy version');
    }

    return new RegistrationConsent(input.acceptedAt, input.policyVersion);
  }

  equals(other: RegistrationConsent): boolean {
    return (
      this.acceptedAt.getTime() === other.acceptedAt.getTime() &&
      this.policyVersion === other.policyVersion &&
      this.scope === other.scope
    );
  }
}
