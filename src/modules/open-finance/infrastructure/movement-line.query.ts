import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { BetMarkConfidence, BetMarkReason } from '../domain/transaction.js';

/** One statement row as a sentence can quote it: normalised name, never the raw line. */
export interface MovementLineEntry {
  readonly transactionId: string;
  readonly occurredAt: string;
  readonly counterparty: string;
  readonly amountInCents: number;
  /** Null for a row that is not classified as a bet, a corrected one included. */
  readonly bet: {
    readonly matchedBy: BetMarkReason;
    readonly confidence: BetMarkConfidence;
  } | null;
}

/**
 * What `open-finance` publishes so another context can name a movement without
 * keeping a copy of it. It reads the projected verdict, the same columns the
 * statement filters by, so a correction moves both, and a revoked consent's rows
 * simply stop being found. Scoped by owner: somebody else's id finds nothing.
 */
export class PrismaMovementLineQuery {
  constructor(private readonly client: PrismaTransactionClient) {}

  async newestOf(
    userId: string,
    transactionIds: readonly string[],
    limit: number,
  ): Promise<readonly MovementLineEntry[]> {
    const rows = await this.client.transaction.findMany({
      where: { userId, id: { in: [...transactionIds] } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        occurredAt: true,
        counterparty: true,
        amountInCents: true,
        betMatchedBy: true,
        betConfidence: true,
      },
    });

    return rows.map((row) => ({
      transactionId: row.id,
      occurredAt: row.occurredAt.toISOString(),
      counterparty: row.counterparty,
      amountInCents: row.amountInCents,
      bet:
        row.betMatchedBy === null || row.betConfidence === null
          ? null
          : { matchedBy: row.betMatchedBy, confidence: row.betConfidence },
    }));
  }
}
