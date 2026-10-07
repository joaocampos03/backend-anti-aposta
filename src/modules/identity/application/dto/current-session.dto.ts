export interface ResolveSessionInput {
  readonly token: string;
}

export interface CurrentSessionOutput {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
  readonly session: {
    readonly expiresAt: string;
  };
  readonly openFinance: {
    /**
     * What separates the post-registration state ("connect an account") from the
     * working product. Computed from the `Consent` aggregate's state — never
     * inferred from whether a transaction exists, and never asserted by the
     * client.
     */
    readonly hasAuthorisedConsent: boolean;
  };
}
