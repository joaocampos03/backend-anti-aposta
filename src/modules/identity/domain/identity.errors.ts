import type { DomainError } from '@shared/domain/domain-error.js';

export type IdentityDomainErrorCode =
  | 'INVALID_EMAIL'
  | 'DISPLAY_NAME_OUT_OF_BOUNDS'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_MISSING';

/**
 * A value, not an exception, and carrying no Portuguese: the application layer
 * decides which code becomes which message. The code is a type parameter so a
 * value object can promise exactly which failures it can produce.
 */
export class IdentityDomainError<TCode extends IdentityDomainErrorCode = IdentityDomainErrorCode>
  implements DomainError
{
  private constructor(readonly code: TCode) {}

  static invalidEmail(): IdentityDomainError<'INVALID_EMAIL'> {
    return new IdentityDomainError('INVALID_EMAIL');
  }

  static displayNameOutOfBounds(): IdentityDomainError<'DISPLAY_NAME_OUT_OF_BOUNDS'> {
    return new IdentityDomainError('DISPLAY_NAME_OUT_OF_BOUNDS');
  }

  static passwordTooShort(): IdentityDomainError<'PASSWORD_TOO_SHORT'> {
    return new IdentityDomainError('PASSWORD_TOO_SHORT');
  }

  static passwordTooLong(): IdentityDomainError<'PASSWORD_TOO_LONG'> {
    return new IdentityDomainError('PASSWORD_TOO_LONG');
  }

  static passwordMissing(): IdentityDomainError<'PASSWORD_MISSING'> {
    return new IdentityDomainError('PASSWORD_MISSING');
  }
}

/**
 * Thrown — not returned — by a repository when the unique index on the e-mail
 * rejects a write the use case's own check had already passed. It is the race
 * between two simultaneous registrations of the same address; the use case
 * catches it and answers the same `409` the check would have produced.
 */
export class EmailCollisionError extends Error {
  constructor() {
    super('EMAIL_COLLISION');
    this.name = 'EmailCollisionError';
  }
}
