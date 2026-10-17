import { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { GamificationError } from './gamification.errors.js';

/**
 * R$ 10.000.000,00. Far past any savings goal this audience sets, and inside a
 * Postgres `integer` with room to spare — the balance is a sum of these, and a
 * cap that let one movement overflow the column would be a cap in name only.
 */
export const MAXIMUM_GOAL_AMOUNT_IN_CENTS = 1_000_000_000;

/**
 * A savings target or one movement against it: strictly positive integer cents.
 * The direction of a movement is carried by `MovementDirection`, never by a sign,
 * so a negative here is always a mistake.
 */
export class GoalAmount {
  private constructor(readonly money: Money) {}

  static fromCents(
    amountInCents: number,
  ): Result<
    GoalAmount,
    GamificationError<'AMOUNT_NOT_AN_INTEGER' | 'AMOUNT_NOT_POSITIVE' | 'AMOUNT_TOO_LARGE'>
  > {
    if (!Number.isSafeInteger(amountInCents)) {
      return fail(GamificationError.of('AMOUNT_NOT_AN_INTEGER'));
    }

    if (amountInCents <= 0) {
      return fail(GamificationError.of('AMOUNT_NOT_POSITIVE'));
    }

    if (amountInCents > MAXIMUM_GOAL_AMOUNT_IN_CENTS) {
      return fail(GamificationError.of('AMOUNT_TOO_LARGE'));
    }

    return ok(new GoalAmount(Money.restore(amountInCents)));
  }

  /** For a value that came from a column guarded by the same bounds. */
  static restore(amountInCents: number): GoalAmount {
    const amount = GoalAmount.fromCents(amountInCents);

    if (!amount.ok) {
      throw new Error(`Corrupted goal amount: ${amountInCents}`);
    }

    return amount.value;
  }

  get inCents(): number {
    return this.money.amountInCents;
  }

  equals(other: GoalAmount): boolean {
    return this.money.equals(other.money);
  }
}
