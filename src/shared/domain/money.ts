import type { DomainError } from './domain-error.js';
import { fail, ok, type Result } from './result.js';

/** The only currency the product handles. */
export type Currency = 'BRL';

export const BRL: Currency = 'BRL';

export class MoneyError implements DomainError {
  private constructor(readonly code: 'AMOUNT_IS_NOT_AN_INTEGER' | 'CURRENCY_MISMATCH') {}

  static notAnInteger(): MoneyError {
    return new MoneyError('AMOUNT_IS_NOT_AN_INTEGER');
  }

  static currencyMismatch(): MoneyError {
    return new MoneyError('CURRENCY_MISMATCH');
  }
}

/**
 * Integer cents plus a currency, and never a `number` loose in the domain.
 *
 * The amount is **signed**: a negative is money leaving the account and a
 * positive is money arriving. The sign carries the direction, which is why
 * nothing strips it on the way through — a total that lost its sign is a total
 * that cannot say whether it is a cost or an income.
 *
 * Formatting belongs to the frontend. The API transports cents.
 */
export class Money {
  private constructor(
    readonly amountInCents: number,
    readonly currency: Currency,
  ) {}

  static fromCents(amountInCents: number, currency: Currency = BRL): Result<Money, MoneyError> {
    if (!Number.isSafeInteger(amountInCents)) {
      return fail(MoneyError.notAnInteger());
    }

    return ok(new Money(amountInCents, currency));
  }

  /** For a value that came from an integer column and cannot be anything else. */
  static restore(amountInCents: number, currency: Currency = BRL): Money {
    const money = Money.fromCents(amountInCents, currency);

    if (!money.ok) {
      throw new Error(`Corrupted monetary value: ${amountInCents}`);
    }

    return money.value;
  }

  static zero(currency: Currency = BRL): Money {
    return new Money(0, currency);
  }

  plus(other: Money): Result<Money, MoneyError> {
    if (other.currency !== this.currency) {
      return fail(MoneyError.currencyMismatch());
    }

    return Money.fromCents(this.amountInCents + other.amountInCents, this.currency);
  }

  minus(other: Money): Result<Money, MoneyError> {
    if (other.currency !== this.currency) {
      return fail(MoneyError.currencyMismatch());
    }

    return Money.fromCents(this.amountInCents - other.amountInCents, this.currency);
  }

  /** The magnitude, for a total whose label already carries the direction. */
  absolute(): Money {
    return new Money(Math.abs(this.amountInCents), this.currency);
  }

  /** Floors at zero: a betting total net of refunds can never be negative. */
  atLeastZero(): Money {
    return new Money(Math.max(this.amountInCents, 0), this.currency);
  }

  isDebit(): boolean {
    return this.amountInCents < 0;
  }

  isCredit(): boolean {
    return this.amountInCents > 0;
  }

  isZero(): boolean {
    return this.amountInCents === 0;
  }

  equals(other: Money): boolean {
    return this.amountInCents === other.amountInCents && this.currency === other.currency;
  }
}
