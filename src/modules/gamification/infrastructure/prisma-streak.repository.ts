import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Streak } from '../domain/streak.js';
import type { StreakRepository } from '../domain/streak.repository.js';
import { StreakMapper } from './streak.mapper.js';

export class PrismaStreakRepository implements StreakRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(streak: Streak): Promise<void> {
    const row = StreakMapper.toRow(streak);

    await this.client.streak.upsert({ where: { userId: row.userId }, create: row, update: row });
  }

  async findByUserId(userId: UniqueEntityId): Promise<Streak | null> {
    const row = await this.client.streak.findUnique({ where: { userId: userId.value } });

    return row === null ? null : StreakMapper.toDomain(row);
  }
}
