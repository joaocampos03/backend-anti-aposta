import { describe, expect, it } from 'vitest';
import { Money } from '@shared/domain/money.js';
import { FIXED_INCOME_ANNUAL_RATE_PERCENT, YieldEquivalent } from './yield-equivalent.js';

describe('YieldEquivalent', () => {
  it('projects the figure the statement shows for a month of bets', () => {
    // R$ 1.840,00 at 11,4% for twelve months is the R$ 2.049,76 on the hero card.
    const projected = YieldEquivalent.of(Money.restore(184000));

    expect(projected.futureValue.amountInCents).toBe(204976);
  });

  it('projects the figure the detail dialog shows for one bet', () => {
    const projected = YieldEquivalent.of(Money.restore(-50000));

    expect(projected.futureValue.amountInCents).toBe(55700);
  });

  it('reframes a debit and a credit of the same size identically', () => {
    expect(YieldEquivalent.of(Money.restore(-50000)).futureValue.amountInCents).toBe(
      YieldEquivalent.of(Money.restore(50000)).futureValue.amountInCents,
    );
  });

  it('reports the gain separately from the future value', () => {
    const projected = YieldEquivalent.of(Money.restore(100000));

    expect(projected.futureValue.amountInCents).toBe(111400);
    expect(projected.gain.amountInCents).toBe(11400);
  });

  it('rounds to whole cents, never to a fraction', () => {
    const projected = YieldEquivalent.of(Money.restore(333));

    expect(Number.isInteger(projected.futureValue.amountInCents)).toBe(true);
    expect(projected.futureValue.amountInCents).toBe(371);
  });

  it('projects zero as zero, so an empty slice reframes to nothing', () => {
    expect(YieldEquivalent.of(Money.zero()).futureValue.amountInCents).toBe(0);
  });

  it('carries the rate it used, so no screen has to assume one', () => {
    const projected = YieldEquivalent.of(Money.restore(100000));

    expect(projected.annualRatePercent).toBe(FIXED_INCOME_ANNUAL_RATE_PERCENT);
    expect(projected.projectionInMonths).toBe(12);
  });

  it('accepts a different rate, so the figure is never hardcoded downstream', () => {
    expect(YieldEquivalent.of(Money.restore(100000), 10).futureValue.amountInCents).toBe(110000);
  });
});
