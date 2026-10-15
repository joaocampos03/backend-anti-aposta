import { describe, expect, it } from 'vitest';
import { aBetEntry } from '../testing/bet-entry-builder.js';
import { BettingCost } from './betting-cost.js';

const ANDORINHA = { bookmakerId: 'bkm_andorinha' };
const VELA = { bookmakerId: 'bkm_vela' };

describe('BettingCost', () => {
  it('nets a refund out of the total without counting it as a bet', () => {
    const cost = BettingCost.from([
      aBetEntry().of(-10_000).from(ANDORINHA).build(),
      aBetEntry().of(-10_000).from(ANDORINHA).build(),
      aBetEntry().of(5_000).from(ANDORINHA).build(),
    ]);

    expect(cost.total.amountInCents).toBe(15_000);
    expect(cost.transactionCount).toBe(2);
    expect(cost.refundTotal.amountInCents).toBe(5_000);
    expect(cost.refundCount).toBe(1);
  });

  it('floors at zero when more came back than went out', () => {
    const cost = BettingCost.from([
      aBetEntry().of(-10_000).build(),
      aBetEntry().of(25_000).build(),
    ]);

    expect(cost.total.amountInCents).toBe(0);
  });

  it('counts the houses, a fully refunded one included', () => {
    const cost = BettingCost.from([
      aBetEntry().of(-10_000).from(ANDORINHA).build(),
      aBetEntry().of(-4_000).from(VELA).build(),
      aBetEntry().of(4_000).from(VELA).build(),
    ]);

    expect(cost.bookmakerCount).toBe(2);
  });

  it('reports the oldest bet placed, never a refund', () => {
    const cost = BettingCost.from([
      aBetEntry().of(-10_000).at(new Date('2026-05-02T12:00:00.000Z')).build(),
      aBetEntry().of(5_000).at(new Date('2026-01-01T12:00:00.000Z')).build(),
      aBetEntry().of(-3_000).at(new Date('2026-03-04T12:00:00.000Z')).build(),
    ]);

    expect(cost.firstBetAt?.toISOString()).toBe('2026-03-04T12:00:00.000Z');
  });

  it('has no first bet when the window holds only refunds', () => {
    const cost = BettingCost.from([aBetEntry().of(7_500).build()]);

    expect(cost.firstBetAt).toBeNull();
    expect(cost.total.amountInCents).toBe(0);
    expect(cost.transactionCount).toBe(0);
  });

  it('is all zeros for a window with nothing in it', () => {
    const cost = BettingCost.empty();

    expect(cost.total.amountInCents).toBe(0);
    expect(cost.bookmakerCount).toBe(0);
    expect(cost.refundCount).toBe(0);
    expect(cost.firstBetAt).toBeNull();
  });
});
