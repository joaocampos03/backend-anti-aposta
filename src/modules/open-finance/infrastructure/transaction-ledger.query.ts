import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type {
  LedgerCursor,
  LedgerFilter,
  LedgerPage,
  LedgerRow,
  LedgerTotalsRow,
  TransactionLedgerQuery,
} from '../application/ports/transaction-ledger.query.port.js';

interface RawLedgerRow {
  readonly id: string;
  readonly occurred_at: Date;
  readonly counterparty: string;
  readonly category: LedgerRow['category'];
  readonly method: LedgerRow['method'];
  readonly status: LedgerRow['status'];
  readonly amount_in_cents: number;
  readonly account_id: string;
  readonly bet_matched_by: LedgerRow['betMatchedBy'];
  readonly bet_confidence: LedgerRow['betConfidence'];
  readonly bet_source: LedgerRow['betSource'];
  readonly overridden_at: Date | null;
}

interface RawTotalsRow {
  readonly credits: bigint;
  readonly debits: bigint;
  readonly net_bet: bigint;
  readonly bet_count: bigint;
}

/**
 * The statement, as a read model.
 *
 * Both halves run against the **same** `WHERE`: the rows are one page of it and
 * the totals are all of it. That is the whole reason the totals are not derived
 * from the page — the hero figure describes the slice the reader chose, and it
 * must not move as they scroll.
 */
export class PrismaTransactionLedgerQuery implements TransactionLedgerQuery {
  constructor(private readonly client: PrismaTransactionClient) {}

  async page(
    filter: LedgerFilter,
    limit: number,
    cursor: LedgerCursor | null,
  ): Promise<LedgerPage> {
    const rows = await this.client.$queryRaw<RawLedgerRow[]>(Prisma.sql`
      SELECT t."id",
             t."occurred_at",
             t."counterparty",
             t."category",
             t."method",
             t."status",
             t."amount_in_cents",
             t."account_id",
             t."bet_matched_by",
             t."bet_confidence",
             t."bet_source",
             t."overridden_at"
        FROM "open_finance_transactions" t
        JOIN "open_finance_connected_accounts" a ON a."id" = t."account_id"
       WHERE ${this.conditions(filter)}
         AND ${this.afterCursor(cursor)}
       ORDER BY t."occurred_at" DESC, t."id" DESC
       LIMIT ${limit + 1}
    `);

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    return {
      rows: page.map((row) => this.toRow(row)),
      nextCursor:
        rows.length > limit && last !== undefined
          ? { occurredAt: last.occurred_at, id: last.id }
          : null,
    };
  }

  async totals(filter: LedgerFilter): Promise<LedgerTotalsRow> {
    const [totals] = await this.client.$queryRaw<RawTotalsRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN t."amount_in_cents" > 0 THEN t."amount_in_cents" ELSE 0 END), 0)::bigint AS credits,
        COALESCE(SUM(CASE WHEN t."amount_in_cents" < 0 THEN -t."amount_in_cents" ELSE 0 END), 0)::bigint AS debits,
        -- Net of refunds: a credit from a bookmaker gives the money back, so it
        -- was never foregone and must not be reframed as a lost yield.
        COALESCE(SUM(CASE WHEN t."bet_matched_by" IS NOT NULL THEN -t."amount_in_cents" ELSE 0 END), 0)::bigint AS net_bet,
        -- Bets placed. A refund is not one.
        COUNT(*) FILTER (WHERE t."bet_matched_by" IS NOT NULL AND t."amount_in_cents" < 0)::bigint AS bet_count
        FROM "open_finance_transactions" t
        JOIN "open_finance_connected_accounts" a ON a."id" = t."account_id"
       WHERE ${this.conditions(filter)}
    `);

    return {
      creditsInCents: Number(totals?.credits ?? 0),
      debitsInCents: Number(totals?.debits ?? 0),
      netBetSpendInCents: Number(totals?.net_bet ?? 0),
      betCount: Number(totals?.bet_count ?? 0),
    };
  }

  /** One indexed existence check: the dialog's 404 must not scan a history. */
  async containsBookmaker(userId: string, bookmakerId: string): Promise<boolean> {
    const found = await this.client.transaction.count({
      where: { userId, betBookmakerId: bookmakerId },
      take: 1,
    });

    return found > 0;
  }

  private conditions(filter: LedgerFilter): Prisma.Sql {
    const clauses: Prisma.Sql[] = [Prisma.sql`t."user_id" = ${filter.userId}::uuid`];

    if (filter.occurredFrom !== null) {
      clauses.push(Prisma.sql`t."occurred_at" >= ${filter.occurredFrom}`);
    }

    if (filter.accountId !== null) {
      clauses.push(Prisma.sql`t."account_id" = ${filter.accountId}::uuid`);
    }

    if (filter.bookmakerId !== null) {
      clauses.push(Prisma.sql`t."bet_bookmaker_id" = ${filter.bookmakerId}`);
    }

    const ofType = this.typeCondition(filter);

    if (ofType !== null) {
      clauses.push(ofType);
    }

    if (filter.search !== null && filter.search.length > 0) {
      clauses.push(this.searchCondition(filter.search));
    }

    return Prisma.join(clauses, ' AND ');
  }

  /** `BETS` reads the projected verdict, so a corrected row leaves the filter. */
  private typeCondition(filter: LedgerFilter): Prisma.Sql | null {
    switch (filter.type) {
      case 'BETS':
        return Prisma.sql`t."bet_matched_by" IS NOT NULL`;
      case 'CREDITS':
        return Prisma.sql`t."amount_in_cents" > 0`;
      case 'DEBITS':
        return Prisma.sql`t."amount_in_cents" < 0`;
      case 'ALL':
        return null;
      default:
        return null;
    }
  }

  /**
   * Accent- and case-insensitive, over the counterparty and the institution.
   * Never over the raw description: this context does not hold one.
   */
  private searchCondition(search: string): Prisma.Sql {
    const pattern = `%${search}%`;

    return Prisma.sql`(
      unaccent(lower(t."counterparty")) LIKE unaccent(lower(${pattern}))
      OR unaccent(lower(a."institution")) LIKE unaccent(lower(${pattern}))
      OR unaccent(lower(a."short_name")) LIKE unaccent(lower(${pattern}))
    )`;
  }

  /**
   * A tuple comparison over `(occurred_at, id)`. An offset would duplicate or
   * skip rows the moment ingestion inserts anything at the top, which it does.
   */
  private afterCursor(cursor: LedgerCursor | null): Prisma.Sql {
    if (cursor === null) {
      return Prisma.sql`TRUE`;
    }

    return Prisma.sql`(t."occurred_at", t."id") < (${cursor.occurredAt}, ${cursor.id}::uuid)`;
  }

  private toRow(raw: RawLedgerRow): LedgerRow {
    return {
      id: raw.id,
      occurredAt: raw.occurred_at,
      counterparty: raw.counterparty,
      category: raw.category,
      method: raw.method,
      status: raw.status,
      amountInCents: raw.amount_in_cents,
      accountId: raw.account_id,
      betMatchedBy: raw.bet_matched_by,
      betConfidence: raw.bet_confidence,
      betSource: raw.bet_source,
      overriddenAt: raw.overridden_at,
    };
  }
}
