import { Money } from '@shared/domain/money.js';
import type { BetEntry } from './bet-entry.js';

/**
 * What a window of betting adds up to, as the hero figure states it.
 *
 * `total` is net: what left for bookmakers minus what came back from them,
 * floored at zero. A refund gives the money back, so it was never foregone, and
 * reframing it as a lost yield would be a made-up number. A month that got back
 * more than it bet is a month with no betting cost — never a negative one.
 *
 * The counts describe **bets placed**. "41 transações" that included money
 * coming back would be counting the wrong thing.
 */
export class BettingCost {
  private constructor(
    readonly total: Money,
    readonly transactionCount: number,
    readonly bookmakerCount: number,
    readonly firstBetAt: Date | null,
    readonly refundTotal: Money,
    readonly refundCount: number,
  ) {}

  static from(entries: readonly BetEntry[]): BettingCost {
    const placed = entries.filter((entry) => entry.isBetPlaced);
    const refunds = entries.filter((entry) => entry.isRefund);

    return new BettingCost(
      BettingCost.net(placed, refunds),
      placed.length,
      new Set(entries.map((entry) => entry.bookmakerId)).size,
      BettingCost.earliest(placed),
      BettingCost.sum(refunds),
      refunds.length,
    );
  }

  static empty(): BettingCost {
    return new BettingCost(Money.zero(), 0, 0, null, Money.zero(), 0);
  }

  private static net(placed: readonly BetEntry[], refunds: readonly BetEntry[]): Money {
    const spent = BettingCost.sum(placed);
    const returned = BettingCost.sum(refunds);
    const net = spent.minus(returned);

    if (!net.ok) {
      throw new Error('A betting cost and its refunds must share a currency');
    }

    return net.value.atLeastZero();
  }

  /** Magnitudes: the label already says which direction the money went. */
  private static sum(entries: readonly BetEntry[]): Money {
    return entries.reduce((running, entry) => {
      const added = running.plus(entry.amount.absolute());

      if (!added.ok) {
        throw new Error('Every betting entry must share one currency');
      }

      return added.value;
    }, Money.zero());
  }

  /** The oldest bet **placed** in the window. A refund is not where it started. */
  private static earliest(placed: readonly BetEntry[]): Date | null {
    return placed.reduce<Date | null>(
      (earliest, entry) =>
        earliest === null || entry.occurredAt.getTime() < earliest.getTime()
          ? entry.occurredAt
          : earliest,
      null,
    );
  }
}
