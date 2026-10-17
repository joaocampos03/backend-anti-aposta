import type { PrismaClient } from '@prisma/client';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import {
  isUniqueViolationOn,
  type PrismaTransactionClient,
} from '@shared/infrastructure/prisma.js';
import { ConcurrentModificationError } from '../domain/gamification.errors.js';
import type { SavingsGoal } from '../domain/savings-goal.js';
import type { SavingsGoalRepository } from '../domain/savings-goal.repository.js';
import { SavingsGoalMapper } from './savings-goal.mapper.js';

/**
 * One aggregate over two tables, written in one transaction. The goal row's
 * `version` is the lock: a movement is appended only by the request that moved
 * the version on, so two withdrawals racing for the same balance cannot both
 * pass the aggregate's check.
 */
export class PrismaSavingsGoalRepository implements SavingsGoalRepository {
  constructor(private readonly client: PrismaClient) {}

  async save(goal: SavingsGoal): Promise<void> {
    try {
      await this.client.$transaction(async (transaction) => {
        await this.writeGoal(transaction, goal);
        await transaction.goalMovement.createMany({
          data: goal.newMovements().map((movement) => SavingsGoalMapper.movementToRow(goal.id, movement)),
        });
      });
    } catch (cause) {
      // The same retry key landing twice at once: the second one lost the race.
      if (isUniqueViolationOn(cause, 'idempotency_key') || isUniqueViolationOn(cause, 'idempotencyKey')) {
        throw new ConcurrentModificationError();
      }

      throw cause;
    }
  }

  async findByIdAndUserId(goalId: UniqueEntityId, userId: UniqueEntityId): Promise<SavingsGoal | null> {
    const row = await this.client.savingsGoal.findFirst({
      where: { id: goalId.value, userId: userId.value },
      include: { movements: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
    });

    return row === null ? null : SavingsGoalMapper.toDomain(row);
  }

  private async writeGoal(transaction: PrismaTransactionClient, goal: SavingsGoal): Promise<void> {
    const row = SavingsGoalMapper.toRow(goal);
    const updated = await transaction.savingsGoal.updateMany({
      where: { id: row.id, version: row.version },
      data: { reachedAt: row.reachedAt, version: row.version + 1 },
    });

    if (updated.count === 1) {
      return;
    }

    const exists = await transaction.savingsGoal.findUnique({ where: { id: row.id }, select: { id: true } });

    if (exists !== null) {
      throw new ConcurrentModificationError();
    }

    await transaction.savingsGoal.create({ data: row });
  }
}
