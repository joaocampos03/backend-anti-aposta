import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { BetMarkConfidence, BetMarkReason } from '../domain/transaction.js';

/**
 * One classified movement in a window, as `bet-detection` needs it to build the
 * betting screen: when it happened, how much, and which house.
 *
 * The amount keeps its sign, because the context reading this is the one that
 * decides what a refund does to a total.
 */
export interface BetWindowEntry {
  readonly transactionId: string;
  readonly occurredAt: Date;
  readonly amountInCents: number;
  readonly bookmakerId: string | null;
  readonly matchedBy: BetMarkReason;
  readonly confidence: BetMarkConfidence;
}

interface RawEntryRow {
  readonly id: string;
  readonly occurred_at: Date;
  readonly amount_in_cents: number;
  readonly bet_bookmaker_id: string | null;
  readonly bet_matched_by: BetMarkReason;
  readonly bet_confidence: BetMarkConfidence;
}

interface RawIncomeRow {
  readonly income: bigint;
}

/**
 * What `open-finance` publishes for the betting screen, as a read model.
 *
 * It reads the **projected** verdict on its own rows, which is the same column
 * `type=BETS` filters the statement by. That is why the two screens cannot
 * disagree about the same money: they are the same `WHERE`, answered from the
 * same table.
 *
 * @see docs/features/bets.md
 */
export class PrismaBettingWindowQuery {
  constructor(private readonly client: PrismaTransactionClient) {}

  /** Debits and refunds alike: netting them is the caller's rule, not a filter. */
  async entriesSince(userId: string, from: Date): Promise<readonly BetWindowEntry[]> {
    const rows = await this.client.$queryRaw<RawEntryRow[]>(Prisma.sql`
      SELECT t."id",
             t."occurred_at",
             t."amount_in_cents",
             t."bet_bookmaker_id",
             t."bet_matched_by",
             t."bet_confidence"
        FROM "open_finance_transactions" t
       WHERE t."user_id" = ${userId}::uuid
         AND t."occurred_at" >= ${from}
         AND t."bet_matched_by" IS NOT NULL
         AND t."bet_confidence" IS NOT NULL
       ORDER BY t."occurred_at" ASC, t."id" ASC
    `);

    return rows.map((row) => ({
      transactionId: row.id,
      occurredAt: row.occurred_at,
      amountInCents: row.amount_in_cents,
      bookmakerId: row.bet_bookmaker_id,
      matchedBy: row.bet_matched_by,
      confidence: row.bet_confidence,
    }));
  }

  /**
   * `INCOME` credits only. A bookmaker's refund is excluded by the verdict on
   * the row, and money moved between the reader's own accounts is excluded by
   * its category — neither is money that came in, and a share of income
   * computed against either would be a made-up number with a percent sign.
   */
  async incomeInCentsSince(userId: string, from: Date): Promise<number> {
    const [totals] = await this.client.$queryRaw<RawIncomeRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(t."amount_in_cents"), 0)::bigint AS income
        FROM "open_finance_transactions" t
       WHERE t."user_id" = ${userId}::uuid
         AND t."occurred_at" >= ${from}
         AND t."amount_in_cents" > 0
         AND t."category" = 'INCOME'
         AND t."bet_matched_by" IS NULL
    `);

    return Number(totals?.income ?? 0);
  }
}
