import { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { GamificationError } from './gamification.errors.js';
import { MAXIMUM_GOAL_AMOUNT_IN_CENTS } from './goal-amount.js';

/**
 * The most the user chose to let go to betting in one calendar month. Zero is a
 * real ceiling — "não apostar nada" — so unlike a savings target it may be zero,
 * and the arithmetic downstream has to answer it rather than divide by it.
 */
export class CeilingAmount {
  private constructor(readonly money: Money) {}

  static fromCents(
    amountInCents: number,
  ): Result<
    CeilingAmount,
    GamificationError<'AMOUNT_NOT_AN_INTEGER' | 'AMOUNT_NEGATIVE' | 'AMOUNT_TOO_LARGE'>
  > {
    if (!Number.isSafeInteger(amountInCents)) {
      return fail(GamificationError.of('AMOUNT_NOT_AN_INTEGER'));
    }

    if (amountInCents < 0) {
      return fail(GamificationError.of('AMOUNT_NEGATIVE'));
    }

    if (amountInCents > MAXIMUM_GOAL_AMOUNT_IN_CENTS) {
      return fail(GamificationError.of('AMOUNT_TOO_LARGE'));
    }

    return ok(new CeilingAmount(Money.restore(amountInCents)));
  }

  static restore(amountInCents: number): CeilingAmount {
    const amount = CeilingAmount.fromCents(amountInCents);

    if (!amount.ok) {
      throw new Error(`Corrupted ceiling amount: ${amountInCents}`);
    }

    return amount.value;
  }

  get inCents(): number {
    return this.money.amountInCents;
  }

  equals(other: CeilingAmount): boolean {
    return this.money.equals(other.money);
  }
}
