import { fail, ok, type Result } from '@shared/domain/result.js';
import { IdentityDomainError } from './identity.errors.js';

const EMAIL_MAXIMUM_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Stored normalised — trimmed and lower cased — so the unique index is a
 * case-insensitive uniqueness guarantee. An Android keyboard will hand the API
 * `" Ana@Exemplo.com "` whatever the input attributes say.
 */
export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Email, IdentityDomainError<'INVALID_EMAIL'>> {
    const normalised = raw.trim().toLowerCase();

    if (normalised.length > EMAIL_MAXIMUM_LENGTH || !EMAIL_PATTERN.test(normalised)) {
      return fail(IdentityDomainError.invalidEmail());
    }

    return ok(new Email(normalised));
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
