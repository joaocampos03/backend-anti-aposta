export interface ResetPasswordInput {
  readonly token: string;
  readonly password: string;
  readonly passwordConfirmation: string;
}

export interface PasswordChangedOutput {
  readonly status: 'PASSWORD_CHANGED';
}
