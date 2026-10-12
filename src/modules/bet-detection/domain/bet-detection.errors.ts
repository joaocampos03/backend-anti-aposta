import type { DomainError } from '@shared/domain/domain-error.js';

export type BetDetectionErrorCode =
  | 'NOT_CLASSIFIED_AS_BET'
  | 'ALREADY_OVERRIDDEN'
  | 'OVERRIDE_NOT_FOUND';

export class BetDetectionError<TCode extends BetDetectionErrorCode = BetDetectionErrorCode>
  implements DomainError
{
  private constructor(readonly code: TCode) {}

  static notClassifiedAsBet(): BetDetectionError<'NOT_CLASSIFIED_AS_BET'> {
    return new BetDetectionError('NOT_CLASSIFIED_AS_BET');
  }

  static alreadyOverridden(): BetDetectionError<'ALREADY_OVERRIDDEN'> {
    return new BetDetectionError('ALREADY_OVERRIDDEN');
  }

  static overrideNotFound(): BetDetectionError<'OVERRIDE_NOT_FOUND'> {
    return new BetDetectionError('OVERRIDE_NOT_FOUND');
  }
}
