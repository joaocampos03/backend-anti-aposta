import { fail, ok, type Result } from '@shared/domain/result.js';
import { GamificationError } from './gamification.errors.js';

export const CEILING_DESTINATION_MAXIMUM_LENGTH = 60;

/**
 * Where the user said the money should go instead — their words, never ours.
 *
 * A statement of intent and **never a balance**: the platform reads
 * transactions, it does not move money, and nothing derived from this may
 * suggest otherwise. Optional, and blank means absent.
 */
export class CeilingDestination {
  private constructor(readonly value: string) {}

  static create(
    raw: string | null,
  ): Result<CeilingDestination | null, GamificationError<'DESTINATION_TOO_LONG'>> {
    const trimmed = raw?.trim() ?? '';

    if (trimmed.length === 0) {
      return ok(null);
    }

    if (trimmed.length > CEILING_DESTINATION_MAXIMUM_LENGTH) {
      return fail(GamificationError.of('DESTINATION_TOO_LONG'));
    }

    return ok(new CeilingDestination(trimmed));
  }

  static restore(value: string | null): CeilingDestination | null {
    const destination = CeilingDestination.create(value);

    if (!destination.ok) {
      throw new Error('Corrupted gamification_ceiling_terms destination');
    }

    return destination.value;
  }

  static same(left: CeilingDestination | null, right: CeilingDestination | null): boolean {
    return (left?.value ?? null) === (right?.value ?? null);
  }
}
