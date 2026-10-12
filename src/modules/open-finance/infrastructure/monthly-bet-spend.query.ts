import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';

interface RawMonthlyBetRow {
  readonly month_key: string;
  readonly net: bigint;
}

/**
 * What this context publishes to `awareness`: the betting spend per calendar
 * month, net of refunds and floored at zero — the same figure the statement and
 * the charts report, so the support rule can never be counting something else.
 */
export class PrismaMonthlyBetSpendQuery {
  constructor(
    private readonly client: PrismaTransactionClient,
    private readonly timeZone: string,
  ) {}

  async betSpendByMonth(
    userId: string,
    monthKeys: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    if (monthKeys.length === 0) {
      return new Map();
    }

    // The window is bounded in SQL by the oldest month asked for, and the
    // exact set is selected here. `HAVING` cannot re-reference the grouped
    // expression, and repeating it there would be a second place to keep the
    // bucketing right.
    const oldest = [...monthKeys].sort()[0] ?? '';
    const requested = new Set(monthKeys);

    const rows = await this.client.$queryRaw<RawMonthlyBetRow[]>(Prisma.sql`
      SELECT to_char(t."occurred_at" AT TIME ZONE ${this.timeZone}, 'YYYY-MM') AS month_key,
             SUM(-t."amount_in_cents")::bigint AS net
        FROM "open_finance_transactions" t
       WHERE t."user_id" = ${userId}::uuid
         AND t."bet_matched_by" IS NOT NULL
         AND t."occurred_at" >= (${`${oldest}-01`}::date AT TIME ZONE ${this.timeZone})
       GROUP BY 1
    `);

    return new Map(
      rows
        .filter((row) => requested.has(row.month_key))
        // Net of refunds and floored: a month refunded more than it bet is a
        // month with no betting spend, never a negative one.
        .map((row) => [row.month_key, Math.max(Number(row.net), 0)]),
    );
  }
}
