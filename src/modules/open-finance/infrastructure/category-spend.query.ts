import { Prisma } from '@prisma/client';
import type { Calendar } from '@shared/domain/calendar.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';

export interface CategorySpendOverMonths {
  /**
   * How many of the months asked for this person actually has history in. It is
   * the denominator of every average taken from this, and it is months of
   * history rather than months with spending in a given category: dropping the
   * quiet months would turn one big grocery run into somebody's "average".
   */
  readonly completeMonthsCounted: number;
  /** Total magnitude spent per category over those months. */
  readonly spentInCentsByCategory: ReadonlyMap<string, number>;
}

interface RawBucketRow {
  readonly bucket: string;
  readonly spent: bigint;
}

interface RawFirstMonthRow {
  readonly first_month_key: string | null;
}

/**
 * What this person spends per month, by category, over whole months.
 *
 * The bucketing is the charts': a transaction classified as a bet counts under
 * `BETS` whatever category it was filed under. A betting total compared against
 * a grocery average that quietly included betting would be comparing the money
 * with itself.
 *
 * @see docs/features/bets.md
 */
export class PrismaCategorySpendQuery {
  constructor(
    private readonly client: PrismaTransactionClient,
    private readonly calendar: Calendar,
    private readonly timeZone: string,
  ) {}

  async totalsOverMonths(
    userId: string,
    monthKeys: readonly string[],
  ): Promise<CategorySpendOverMonths> {
    const sorted = [...monthKeys].sort();
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];

    if (oldest === undefined || newest === undefined) {
      return { completeMonthsCounted: 0, spentInCentsByCategory: new Map() };
    }

    const from = this.calendar.startOfMonth(oldest);
    const until = this.calendar.startOfMonthAfter(newest);

    const [buckets, firstMonthKey] = await Promise.all([
      this.spendBetween(userId, from, until),
      this.firstMonthKeyOf(userId),
    ]);

    return {
      completeMonthsCounted: this.monthsWithHistory(sorted, firstMonthKey),
      spentInCentsByCategory: buckets,
    };
  }

  private async spendBetween(
    userId: string,
    from: Date,
    until: Date,
  ): Promise<ReadonlyMap<string, number>> {
    const rows = await this.client.$queryRaw<RawBucketRow[]>(Prisma.sql`
      SELECT CASE
               WHEN t."bet_matched_by" IS NOT NULL THEN 'BETS'
               WHEN t."category" = 'BETS' THEN 'OTHER'
               ELSE t."category"::text
             END AS bucket,
             SUM(-t."amount_in_cents")::bigint AS spent
        FROM "open_finance_transactions" t
       WHERE t."user_id" = ${userId}::uuid
         AND t."occurred_at" >= ${from}
         AND t."occurred_at" < ${until}
         AND t."amount_in_cents" < 0
       GROUP BY 1
    `);

    return new Map(rows.map((row) => [row.bucket, Number(row.spent)]));
  }

  private async firstMonthKeyOf(userId: string): Promise<string | null> {
    const [row] = await this.client.$queryRaw<RawFirstMonthRow[]>(Prisma.sql`
      SELECT to_char(MIN(t."occurred_at") AT TIME ZONE ${this.timeZone}, 'YYYY-MM') AS first_month_key
        FROM "open_finance_transactions" t
       WHERE t."user_id" = ${userId}::uuid
    `);

    return row?.first_month_key ?? null;
  }

  /** A reader with no history at all has no complete month, and no average. */
  private monthsWithHistory(monthKeys: readonly string[], firstMonthKey: string | null): number {
    if (firstMonthKey === null) {
      return 0;
    }

    return monthKeys.filter((monthKey) => monthKey >= firstMonthKey).length;
  }
}
