import type { DomainError } from '@shared/domain/domain-error.js';
import { fail, ok, type Result } from '@shared/domain/result.js';

const CNPJ_LENGTH = 14;
const NON_DIGITS = /\D/g;

export class InvalidCnpjError implements DomainError {
  readonly code = 'INVALID_CNPJ';
}

/**
 * The counterparty's registration number, normalised to its fourteen digits.
 *
 * Check digits are deliberately **not** validated. The bookmaker registry is the
 * authority on which documents matter here, and the repository's rule is that no
 * real CNPJ ever enters it — a check-digit gate would force every fixture and
 * every seed to carry a structurally plausible document, which is exactly what
 * that rule exists to avoid.
 */
export class Cnpj {
  private constructor(readonly digits: string) {}

  static create(raw: string): Result<Cnpj, InvalidCnpjError> {
    const digits = raw.replace(NON_DIGITS, '');

    if (digits.length !== CNPJ_LENGTH) {
      return fail(new InvalidCnpjError());
    }

    return ok(new Cnpj(digits));
  }

  equals(other: Cnpj): boolean {
    return this.digits === other.digits;
  }
}
