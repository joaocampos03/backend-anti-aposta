import type { RegisterUserInput } from '../application/dto/register-user.dto.js';

/**
 * Arrange with a builder, not a 40-line object literal: a test says what makes
 * it different and nothing else.
 */
export class RegistrationBuilder {
  private input: RegisterUserInput = {
    name: 'Ana',
    email: 'ana@exemplo.com',
    password: 'quatro palavras comuns',
    passwordConfirmation: 'quatro palavras comuns',
    acceptedRegistrationConsent: true,
  };

  named(name: string): this {
    this.input = { ...this.input, name };

    return this;
  }

  withEmail(email: string): this {
    this.input = { ...this.input, email };

    return this;
  }

  withPassword(password: string): this {
    this.input = { ...this.input, password, passwordConfirmation: password };

    return this;
  }

  withPasswordConfirmation(passwordConfirmation: string): this {
    this.input = { ...this.input, passwordConfirmation };

    return this;
  }

  withoutConsent(): this {
    this.input = { ...this.input, acceptedRegistrationConsent: false };

    return this;
  }

  build(): RegisterUserInput {
    return this.input;
  }
}

export function aRegistration(): RegistrationBuilder {
  return new RegistrationBuilder();
}
