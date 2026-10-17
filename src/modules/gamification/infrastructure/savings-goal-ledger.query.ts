import { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type {
  GoalMovementRow,
  Page,
  PageCursor,
  SavingsGoalLedgerQuery,
  SavingsGoalSummaryRow,
} from '../application/ports/savings-goal-ledger.query.port.js';
import { GOAL_PURPOSES, type GoalPurpose } from '../domain/goal-purpose.js';

interface RawGoalSummaryRow {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly target_in_cents: number;
  readonly saved_in_cents: bigint;
  readonly movement_count: number;
  readonly reached_at: Date | null;
  readonly created_at: Date;
}

function isGoalPurpose(value: string): value is GoalPurpose {
  return GOAL_PURPOSES.some((purpose) => purpose === value);
}

function toSummary(row: RawGoalSummaryRow): SavingsGoalSummaryRow {
  if (!isGoalPurpose(row.purpose)) {
    throw new Error(`Corrupted gamification_savings_goals purpose: ${row.id}`);
  }

  return {
    id: row.id,
    title: row.title,
    purpose: row.purpose,
    targetInCents: row.target_in_cents,
    savedInCents: Number(row.saved_in_cents),
    reachedAt: row.reached_at,
    movementCount: row.movement_count,
    createdAt: row.created_at,
  };
}

/** One more row than asked for says whether another page exists, without a count. */
function paged<TRow>(
  rows: readonly TRow[],
  limit: number,
  cursorOf: (row: TRow) => PageCursor,
): Page<TRow> {
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);

  return {
    rows: pageRows,
    nextCursor: rows.length > limit && last !== undefined ? cursorOf(last) : null,
  };
}

/**
 * The savings goals as a read model: the balance summed in SQL from the same
 * append-only movements the aggregate sums in memory, so the list and the
 * card after a deposit cannot disagree. Every question is scoped by owner.
 */
export class PrismaSavingsGoalLedgerQuery implements SavingsGoalLedgerQuery {
  constructor(private readonly client: PrismaTransactionClient) {}

  async goalsOf(userId: string, limit: number, cursor: PageCursor | null): Promise<Page<SavingsGoalSummaryRow>> {
    const rows = await this.summaries(
      Prisma.sql`g."user_id" = ${userId}::uuid AND ${this.goalsAfter(cursor)}`,
      limit + 1,
    );

    return paged(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
  }

  async movementsOf(
    userId: string,
    goalId: string,
    limit: number,
    cursor: PageCursor | null,
  ): Promise<Page<GoalMovementRow> | null> {
    const owned = await this.client.savingsGoal.findFirst({ where: { id: goalId, userId }, select: { id: true } });

    if (owned === null) {
      return null;
    }

    const rows = await this.client.goalMovement.findMany({
      where: { goalId, ...this.movementsAfter(cursor) },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, direction: true, amountInCents: true, occurredAt: true, reachedTarget: true },
    });

    return paged(rows, limit, (row) => ({ at: row.occurredAt, id: row.id }));
  }

  private async summaries(where: Prisma.Sql, take: number): Promise<readonly SavingsGoalSummaryRow[]> {
    const rows = await this.client.$queryRaw<RawGoalSummaryRow[]>(Prisma.sql`
      SELECT g."id", g."title", g."purpose"::text AS purpose, g."target_in_cents",
             g."reached_at", g."created_at",
             COALESCE(SUM(CASE m."direction"
                            WHEN 'DEPOSIT' THEN m."amount_in_cents"
                            ELSE -m."amount_in_cents"
                          END), 0)::bigint AS saved_in_cents,
             COUNT(m."id")::int AS movement_count
        FROM "gamification_savings_goals" g
        LEFT JOIN "gamification_goal_movements" m ON m."goal_id" = g."id"
       WHERE ${where}
       GROUP BY g."id"
       ORDER BY g."created_at" DESC, g."id" DESC
       LIMIT ${take}
    `);

    return rows.map(toSummary);
  }

  private goalsAfter(cursor: PageCursor | null): Prisma.Sql {
    if (cursor === null) {
      return Prisma.sql`TRUE`;
    }

    return Prisma.sql`(g."created_at", g."id") < (${cursor.at}, ${cursor.id}::uuid)`;
  }

  private movementsAfter(cursor: PageCursor | null): Prisma.GoalMovementWhereInput {
    if (cursor === null) {
      return {};
    }

    return {
      OR: [
        { occurredAt: { lt: cursor.at } },
        { occurredAt: cursor.at, id: { lt: cursor.id } },
      ],
    };
  }
}
