const HOURS_PER_BUCKET = 3;
const HOURS_IN_A_DAY = 24;
const BUCKETS = HOURS_IN_A_DAY / HOURS_PER_BUCKET;

/**
 * One three-hour band of the day, São Paulo time, and a count of the bets
 * placed in it.
 *
 * It carries a count and nothing else. No band is labelled late, risky or
 * problematic: the reader draws their own conclusion from their own pattern,
 * and a server that called one of them "risky" would be diagnosing somebody
 * from eight integers.
 */
export class HourBucket {
  private constructor(
    readonly startHour: number,
    readonly count: number,
  ) {}

  /**
   * Always eight buckets, zeros included, `startHour` 0 to 21 in steps of 3.
   * A sparse array would make the client decide what a missing band means.
   */
  static distribute(hours: readonly number[]): readonly HourBucket[] {
    const counts = new Array<number>(BUCKETS).fill(0);

    for (const hour of hours) {
      // Clamped rather than trusted: a ninth bucket would silently break the
      // "always eight" contract the client lays out its chart from.
      const bucket = Math.min(Math.max(Math.floor(hour / HOURS_PER_BUCKET), 0), BUCKETS - 1);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }

    return counts.map((count, index) => new HourBucket(index * HOURS_PER_BUCKET, count));
  }
}
