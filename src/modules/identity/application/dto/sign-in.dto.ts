export interface SignInInput {
  readonly email: string;
  readonly password: string;
}

export interface SignedInOutput {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
  readonly session: {
    /** Read by the Next.js server only, which sets its own cookie from it. */
    readonly token: string;
    readonly expiresAt: string;
  };
  readonly openFinance: {
    readonly hasAuthorisedConsent: boolean;
  };
}
