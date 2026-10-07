import { fail, ok, type Result } from '@shared/domain/result.js';
import { IdentityDomainError } from './identity.errors.js';
import {
  assessPassword,
  PASSWORD_MAXIMUM_LENGTH,
  PASSWORD_MINIMUM_LENGTH,
  type PasswordStrength,
} from './password-policy.js';

/**
 * The plaintext password, alive only between the request boundary and the
 * hasher. It is never persisted, never logged and never part of a DTO.
 */
export class Password {
  private constructor(private readonly plaintext: string) {}

  static create(
    raw: string,
  ): Result<Password, IdentityDomainError<'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG'>> {
    if (raw.length < PASSWORD_MINIMUM_LENGTH) {
      return fail(IdentityDomainError.passwordTooShort());
    }

    if (raw.length > PASSWORD_MAXIMUM_LENGTH) {
      return fail(IdentityDomainError.passwordTooLong());
    }

    return ok(new Password(raw));
  }

  /**
   * A sign-in attempt, which the policy deliberately does **not** gate. A
   * minimum length applied to an existing credential locks out whoever set a
   * shorter password before the policy existed: validate that it is present,
   * not that it is good.
   */
  static attempt(
    raw: string,
  ): Result<Password, IdentityDomainError<'PASSWORD_MISSING' | 'PASSWORD_TOO_LONG'>> {
    if (raw.length === 0) {
      return fail(IdentityDomainError.passwordMissing());
    }

    if (raw.length > PASSWORD_MAXIMUM_LENGTH) {
      return fail(IdentityDomainError.passwordTooLong());
    }

    return ok(new Password(raw));
  }

  /** Advice the policy records, never a reason to refuse the registration. */
  get strength(): PasswordStrength {
    return assessPassword(this.plaintext);
  }

  /** Read by the hasher adapter and by nothing else. */
  reveal(): string {
    return this.plaintext;
  }

  matchesConfirmation(confirmation: string): boolean {
    return this.plaintext === confirmation;
  }
}
