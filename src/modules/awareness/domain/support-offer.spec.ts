import { describe, expect, it } from 'vitest';
import { HIGH_BAND_FLOOR_IN_CENTS, SupportOffer, type MonthlyBetSpend } from './support-offer.js';

const ABOVE = HIGH_BAND_FLOOR_IN_CENTS + 50_000;
const BELOW = HIGH_BAND_FLOOR_IN_CENTS - 1;

function months(...spends: readonly number[]): readonly MonthlyBetSpend[] {
  return spends.map((betSpendInCents, index) => ({
    monthKey: `2026-${String(9 - index).padStart(2, '0')}`,
    betSpendInCents,
  }));
}

describe('SupportOffer', () => {
  describe('the negative cases, which are the ones that matter', () => {
    it('does not offer after two sustained months', () => {
      const offer = SupportOffer.from(months(ABOVE, ABOVE, BELOW));

      expect(offer.shouldOffer).toBe(false);
      expect(offer.sustainedMonths).toBe(2);
    });

    it('does not offer when a month below the floor interrupts the run', () => {
      const offer = SupportOffer.from(months(ABOVE, ABOVE, BELOW, ABOVE, ABOVE, ABOVE));

      expect(offer.shouldOffer).toBe(false);
      expect(offer.sustainedMonths).toBe(2);
    });

    it('does not offer when the latest whole month fell below the floor', () => {
      const offer = SupportOffer.from(months(BELOW, ABOVE, ABOVE, ABOVE));

      expect(offer.shouldOffer).toBe(false);
      expect(offer.sustainedMonths).toBe(0);
    });

    it('does not offer with no history at all', () => {
      const offer = SupportOffer.from([]);

      expect(offer.shouldOffer).toBe(false);
      expect(offer.sustainedMonths).toBe(0);
      expect(offer.isRising).toBe(false);
    });

    it('does not offer for a month that merely touches the floor twice', () => {
      const offer = SupportOffer.from(months(HIGH_BAND_FLOOR_IN_CENTS, HIGH_BAND_FLOOR_IN_CENTS));

      expect(offer.shouldOffer).toBe(false);
    });
  });

  it('offers after three consecutive whole months at or above the floor', () => {
    const offer = SupportOffer.from(months(ABOVE, ABOVE, ABOVE));

    expect(offer.shouldOffer).toBe(true);
    expect(offer.sustainedMonths).toBe(3);
  });

  it('counts a month exactly at the floor as above it', () => {
    const offer = SupportOffer.from(
      months(HIGH_BAND_FLOOR_IN_CENTS, HIGH_BAND_FLOOR_IN_CENTS, HIGH_BAND_FLOOR_IN_CENTS),
    );

    expect(offer.shouldOffer).toBe(true);
  });

  it('counts the whole run, not just the three it needed', () => {
    const offer = SupportOffer.from(months(ABOVE, ABOVE, ABOVE, ABOVE, BELOW));

    expect(offer.sustainedMonths).toBe(4);
  });

  describe('isRising', () => {
    it('is true only when each month exceeded the one before it', () => {
      const offer = SupportOffer.from(months(300_000, 200_000, 150_000));

      expect(offer.isRising).toBe(true);
    });

    it('is false when a month merely held steady', () => {
      const offer = SupportOffer.from(months(200_000, 200_000, 150_000));

      expect(offer.isRising).toBe(false);
    });

    it('is false when the run fell at any point', () => {
      const offer = SupportOffer.from(months(300_000, 350_000, 150_000));

      expect(offer.isRising).toBe(false);
    });

    it('is false for a single sustained month, which has nothing to rise from', () => {
      expect(SupportOffer.from(months(ABOVE, BELOW)).isRising).toBe(false);
    });
  });

  it('reports the threshold it used, so the copy cannot disagree with the rule', () => {
    expect(SupportOffer.from([]).thresholdInCents).toBe(HIGH_BAND_FLOOR_IN_CENTS);
  });

  it('carries no diagnosis of any kind', () => {
    const offer = SupportOffer.from(months(ABOVE, ABOVE, ABOVE));

    expect(Object.keys(offer).sort()).toEqual([
      'isRising',
      'shouldOffer',
      'sustainedMonths',
      'thresholdInCents',
    ]);
  });
});
