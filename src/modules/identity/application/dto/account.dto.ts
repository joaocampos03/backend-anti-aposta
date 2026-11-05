export interface DescribeAccountInput {
  readonly userId: string;
}

export interface AccountOutput {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly registeredAt: string;
  };
  readonly registrationConsent: {
    readonly acceptedAt: string;
    readonly policyVersion: string;
    readonly scope: string;
  };
  readonly activeSessionCount: number;
}

export interface ChangeDisplayNameInput {
  readonly userId: string;
  readonly name: string;
}

export interface ChangeEmailInput {
  readonly userId: string;
  readonly email: string;
  readonly currentPassword: string;
}

export interface ChangePasswordInput {
  readonly userId: string;
  /** The session making the change, the one that stays signed in. */
  readonly token: string;
  readonly currentPassword: string;
  readonly password: string;
  readonly passwordConfirmation: string;
}

export interface EndOtherSessionsInput {
  readonly userId: string;
  readonly token: string;
}

export interface DeleteAccountInput {
  readonly userId: string;
  readonly currentPassword: string;
}
