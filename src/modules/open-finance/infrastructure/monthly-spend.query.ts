import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type {
  MonthlyBucketTotal,
  MonthlySpendQuery,
} from '../application/ports/monthly-spend.query.port.js';
import type { TransactionCategory } from '../domain/transaction-attributes.js';

interface RawMonthlyRow {
  readonly month_key: string;
  readonly bucket: TransactionCategory;
  readonly net: bigint;
}

/**
 * The charts, as a read model.
 *
 * Two things make it agree with the statement by construction rather than by
 * coincidence: the months are bucketed in the same timezone the day keys use,
 * and a transaction classified as a bet counts under `BETS` whatever category
 * it was filed under — which is exactly what `type=BETS` selects on the other
 * endpoint.
 */
export class PrismaMonthlySpendQuery implements MonthlySpendQuery {
  constructor(
    private readonly client: PrismaTransactionClient,
    private readonly timeZone: string,
  ) {}

  async totalsByMonth(userId: string, from: Date): Promise<readonly MonthlyBucketTotal[]> {
    const rows = await this.client.$queryRaw<RawMonthlyRow[]>(Prisma.sql`
      SELECT to_char(t."occurred_at" AT TIME ZONE ${this.timeZone}, 'YYYY-MM') AS month_key,
             CASE
               -- The BETS series is the *classification's*, never the category's.
               WHEN t."bet_matched_by" IS NOT NULL THEN 'BETS'
               -- A row filed as betting that the chain no longer calls a bet —
               -- because its owner corrected it — must leave the series, or the
               -- correction would change the statement and not the chart.
               WHEN t."category" = 'BETS' THEN 'OTHER'
               ELSE t."category"::text
             END AS bucket,
             SUM(t."amount_in_cents")::bigint AS net
        FROM "open_finance_transactions" t
       WHERE t."user_id" = ${userId}::uuid
         AND t."occurred_at" >= ${from}
       GROUP BY 1, 2
    `);

    return rows.map((row) => ({
      monthKey: row.month_key,
      bucket: row.bucket,
      netAmountInCents: Number(row.net),
    }));
  }
}
