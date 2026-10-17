import type { PrismaClient } from '@prisma/client';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import {
  isUniqueViolationOn,
  type PrismaTransactionClient,
} from '@shared/infrastructure/prisma.js';
import type { BettingCeiling } from '../domain/betting-ceiling.js';
import type { BettingCeilingRepository } from '../domain/betting-ceiling.repository.js';
import { ConcurrentModificationError } from '../domain/gamification.errors.js';
import { BettingCeilingMapper } from './betting-ceiling.mapper.js';

/**
 * The ceiling and its terms in one transaction. The terms are a short list the
 * aggregate owns outright, so they are replaced whole under the version lock
 * rather than diffed.
 */
export class PrismaBettingCeilingRepository implements BettingCeilingRepository {
  constructor(private readonly client: PrismaClient) {}

  async save(ceiling: BettingCeiling): Promise<void> {
    try {
      await this.client.$transaction(async (transaction) => {
        await this.writeCeiling(transaction, ceiling);
        await transaction.ceilingTerm.deleteMany({ where: { ceilingId: ceiling.id.value } });
        await transaction.ceilingTerm.createMany({ data: BettingCeilingMapper.termRows(ceiling) });
      });
    } catch (cause) {
      // Two first ceilings for the same person at once: one row per user, and
      // the second request lost.
      if (isUniqueViolationOn(cause, 'user_id') || isUniqueViolationOn(cause, 'userId')) {
        throw new ConcurrentModificationError();
      }

      throw cause;
    }
  }

  async findByUserId(userId: UniqueEntityId): Promise<BettingCeiling | null> {
    const row = await this.client.bettingCeiling.findUnique({
      where: { userId: userId.value },
      include: { terms: { orderBy: { effectiveFrom: 'asc' } } },
    });

    return row === null ? null : BettingCeilingMapper.toDomain(row);
  }

  private async writeCeiling(transaction: PrismaTransactionClient, ceiling: BettingCeiling): Promise<void> {
    const row = BettingCeilingMapper.toRow(ceiling);
    const updated = await transaction.bettingCeiling.updateMany({
      where: { id: row.id, version: row.version },
      data: { version: row.version + 1 },
    });

    if (updated.count === 1) {
      return;
    }

    const exists = await transaction.bettingCeiling.findUnique({ where: { id: row.id }, select: { id: true } });

    if (exists !== null) {
      throw new ConcurrentModificationError();
    }

    await transaction.bettingCeiling.create({ data: row });
  }
}
