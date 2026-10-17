import type { DomainError } from '@shared/domain/domain-error.js';

export type GamificationErrorCode =
  | 'GOAL_TITLE_TOO_SHORT'
  | 'GOAL_TITLE_TOO_LONG'
  | 'AMOUNT_NOT_AN_INTEGER'
  | 'AMOUNT_NOT_POSITIVE'
  | 'AMOUNT_NEGATIVE'
  | 'AMOUNT_TOO_LARGE'
  | 'INSUFFICIENT_BALANCE'
  | 'DESTINATION_TOO_LONG';

export class GamificationError<TCode extends GamificationErrorCode = GamificationErrorCode>
  implements DomainError
{
  private constructor(readonly code: TCode) {}

  static of<TCode extends GamificationErrorCode>(code: TCode): GamificationError<TCode> {
    return new GamificationError(code);
  }
}

/**
 * Thrown — not returned — by a repository when the row's `version` moved
 * between the read and the write: another request changed the same aggregate
 * first. The use case catches it and answers `409`, so the person reloads and
 * sees the balance that actually stands instead of one this request assumed.
 */
export class ConcurrentModificationError extends Error {
  constructor() {
    super('CONCURRENT_MODIFICATION');
    this.name = 'ConcurrentModificationError';
  }
}
