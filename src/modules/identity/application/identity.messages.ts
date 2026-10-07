/**
 * Every Portuguese string this module can put in front of a person, in one
 * place. Four of them are already in the frontend verbatim and must not drift:
 * the consent message, the confirmation mismatch, the minimum-length message and
 * the per-field validation copy.
 *
 * None of them moralises, none of them mentions what the person spends, and none
 * of them implies the platform can block or prevent a transaction.
 */
export const IDENTITY_MESSAGES = {
  emailAlreadyRegistered: 'Este e-mail já tem uma conta. Entre ou recupere a senha.',
  validationFailed: 'Confira os campos destacados.',
  consentRequired: 'Para criar a conta é preciso autorizar o uso do nome e do e-mail.',
  passwordTooShort: 'Use pelo menos 8 caracteres.',
  passwordTooLong: 'Use no máximo 128 caracteres.',
  passwordConfirmationMismatch: 'As duas senhas não são iguais.',
  tooManyRegistrationAttempts: 'Muitas tentativas. Tente novamente em alguns minutos.',
  invalidCredentials: 'E-mail ou senha incorretos.',
  tooManySignInAttempts: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  signInUnavailable: 'Não conseguimos entrar agora. Tente novamente em instantes.',
  passwordResetTokenInvalid: 'Este link não é mais válido. Peça um novo link de redefinição.',
  passwordChangeUnavailable:
    'Não conseguimos alterar sua senha agora. Tente novamente em instantes.',
  registrationUnavailable: 'Não conseguimos criar sua conta agora. Tente novamente em instantes.',
  currentSessionUnavailable:
    'Não conseguimos carregar sua conta agora. Tente novamente em instantes.',
  sessionNotValid: 'Sua sessão não é mais válida. Entre novamente.',
} as const;

/** Anchored under the field that failed, in a card 22rem wide. */
export const IDENTITY_FIELD_MESSAGES = {
  name: 'Informe como você quer ser chamado — pelo menos 2 caracteres.',
  email: 'Informe um e-mail válido.',
  password: IDENTITY_MESSAGES.passwordTooShort,
  /** Sign-in asks only that the field is filled in, never that it is long. */
  passwordMissing: 'Informe sua senha.',
  unexpected: 'Este campo não é aceito.',
} as const;
