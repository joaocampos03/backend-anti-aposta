import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('refuses a fractional amount, because cents are the smallest unit', () => {
    expect(Money.fromCents(12.5).ok).toBe(false);
  });

  it('accepts a negative amount: the sign is the direction', () => {
    const debit = Money.fromCents(-5000);

    expect(debit.ok && debit.value.isDebit()).toBe(true);
    expect(debit.ok && debit.value.isCredit()).toBe(false);
  });

  it('adds two amounts of the same currency', () => {
    const total = Money.restore(1200).plus(Money.restore(-500));

    expect(total.ok && total.value.amountInCents).toBe(700);
  });

  it('reports the magnitude for a total whose label carries the direction', () => {
    expect(Money.restore(-18740).absolute().amountInCents).toBe(18740);
  });

  it('floors at zero, so a betting total net of refunds is never negative', () => {
    expect(Money.restore(-2500).atLeastZero().amountInCents).toBe(0);
    expect(Money.restore(2500).atLeastZero().amountInCents).toBe(2500);
  });

  it('compares by value, never by reference', () => {
    expect(Money.restore(1250).equals(Money.restore(1250))).toBe(true);
    expect(Money.restore(1250).equals(Money.restore(1251))).toBe(false);
  });

  it('throws when restoring a value a column should never have held', () => {
    expect(() => Money.restore(0.5)).toThrow();
  });
});
