import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Session } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';
import { SessionMapper } from './session.mapper.js';

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(session: Session): Promise<void> {
    const row = SessionMapper.toRow(session);

    await this.client.session.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async findByTokenFingerprint(tokenFingerprint: string): Promise<Session | null> {
    const row = await this.client.session.findUnique({ where: { tokenHash: tokenFingerprint } });

    return row === null ? null : SessionMapper.toDomain(row);
  }

  async findActiveByUserId(userId: UniqueEntityId): Promise<readonly Session[]> {
    const rows = await this.client.session.findMany({
      where: { userId: userId.value, revokedAt: null },
    });

    return rows.map((row) => SessionMapper.toDomain(row));
  }
}
