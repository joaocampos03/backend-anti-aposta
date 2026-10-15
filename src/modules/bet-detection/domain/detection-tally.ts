import { strengthOf, type DetectionReason } from './bet-classification.js';
import type { BetEntry } from './bet-entry.js';

const PERCENT = 100;

/**
 * How many of the window's bets each policy caught.
 *
 * The screen shows it so the reader can see **why** the product called these
 * transactions bets. A share with no reason behind it is the thing that makes
 * somebody stop trusting the figure above it.
 */
export class DetectionTally {
  private constructor(
    readonly matchedBy: DetectionReason,
    readonly count: number,
    readonly sharePercent: number,
  ) {}

  /**
   * Bets **placed** only: a refund adds no policy match. Policies that caught
   * nothing are absent rather than listed at zero, and the shares are rounded
   * independently, so they may sum to 99 or 101. Nothing here "fixes" that —
   * adjusting a share to make a column add up would misreport one of them.
   */
  static of(entries: readonly BetEntry[]): readonly DetectionTally[] {
    const placed = entries.filter((entry) => entry.isBetPlaced);
    const counts = new Map<DetectionReason, number>();

    for (const entry of placed) {
      counts.set(entry.matchedBy, (counts.get(entry.matchedBy) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(
        ([matchedBy, count]) =>
          new DetectionTally(matchedBy, count, Math.round((count / placed.length) * PERCENT)),
      )
      .sort(compareTallies);
  }
}

/** By count, then by policy strength, so two loads cannot reshuffle. */
function compareTallies(left: DetectionTally, right: DetectionTally): number {
  return right.count - left.count || strengthOf(left.matchedBy) - strengthOf(right.matchedBy);
}
