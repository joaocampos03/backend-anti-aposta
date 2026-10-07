import type { RegistrationConsentScope } from '../../domain/registration-consent.js';

export interface RegisterUserInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly passwordConfirmation: string;
  readonly acceptedRegistrationConsent: boolean;
}

export interface RegisteredUserOutput {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly registeredAt: string;
  };
  readonly registrationConsent: {
    readonly acceptedAt: string;
    readonly policyVersion: string;
    readonly scope: RegistrationConsentScope;
  };
  readonly session: {
    /** Read by the Next.js server only, which sets its own cookie from it. */
    readonly token: string;
    readonly expiresAt: string;
  };
}
