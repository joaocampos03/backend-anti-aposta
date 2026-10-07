import { fail, ok, type Result } from '@shared/domain/result.js';
import { IdentityDomainError } from './identity.errors.js';

export const DISPLAY_NAME_MINIMUM_LENGTH = 2;
export const DISPLAY_NAME_MAXIMUM_LENGTH = 80;

/**
 * How the person wants to be called in the app — never a legal name, and never a
 * CPF. The registration form asks for three fields and this is one of them.
 */
export class DisplayName {
  private constructor(readonly value: string) {}

  static create(
    raw: string,
  ): Result<DisplayName, IdentityDomainError<'DISPLAY_NAME_OUT_OF_BOUNDS'>> {
    const trimmed = raw.trim();

    if (
      trimmed.length < DISPLAY_NAME_MINIMUM_LENGTH ||
      trimmed.length > DISPLAY_NAME_MAXIMUM_LENGTH
    ) {
      return fail(IdentityDomainError.displayNameOutOfBounds());
    }

    return ok(new DisplayName(trimmed));
  }

  equals(other: DisplayName): boolean {
    return this.value === other.value;
  }
}
