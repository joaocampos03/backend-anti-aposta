import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { BetMarkReason } from '../domain/transaction.js';

/** One local day with a betting debit, named by the first bet placed on it. */
export interface BetDayEntry {
  /** `YYYY-MM-DD` in the time zone asked for. */
  readonly dayKey: string;
  readonly counterparty: string;
  readonly matchedBy: BetMarkReason;
}

interface RawBetDayRow {
  readonly day_key: string;
  readonly counterparty: string;
  readonly bet_matched_by: BetMarkReason;
}

/**
 * What `open-finance` publishes for the bet-free streaks, as a read model.
 *
 * It reads the **projected** verdict on its own rows — the same column the
 * statement filters `type=BETS` by — so a day with a bet here is a day with a
 * betting row there, and a correction moves both. Debits only: a bookmaker's
 * refund is money coming back, not a bet placed. One row per day, bucketed in
 * the caller's time zone in SQL, so a heavy year is at most 366 rows.
 */
export class PrismaBetDayQuery {
  constructor(private readonly client: PrismaTransactionClient) {}

  async firstBetOfEachDaySince(userId: string, from: Date, timeZone: string): Promise<readonly BetDayEntry[]> {
    const rows = await this.client.$queryRaw<RawBetDayRow[]>(Prisma.sql`
      SELECT DISTINCT ON (d."day_key") d."day_key", d."counterparty", d."bet_matched_by"
        FROM (
          SELECT to_char(t."occurred_at" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS "day_key",
                 t."counterparty",
                 t."bet_matched_by",
                 t."occurred_at",
                 t."id"
            FROM "open_finance_transactions" t
           WHERE t."user_id" = ${userId}::uuid
             AND t."occurred_at" >= ${from}
             AND t."bet_matched_by" IS NOT NULL
             AND t."amount_in_cents" < 0
        ) d
       ORDER BY d."day_key" ASC, d."occurred_at" ASC, d."id" ASC
    `);

    return rows.map((row) => ({
      dayKey: row.day_key,
      counterparty: row.counterparty,
      matchedBy: row.bet_matched_by,
    }));
  }
}
