import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { PasswordResetToken } from '../domain/password-reset-token.js';
import type { PasswordResetTokenRepository } from '../domain/password-reset-token.repository.js';
import { PasswordResetTokenMapper } from './password-reset-token.mapper.js';

export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(token: PasswordResetToken): Promise<void> {
    const row = PasswordResetTokenMapper.toRow(token);

    await this.client.passwordResetToken.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }

  async findByTokenFingerprint(tokenFingerprint: string): Promise<PasswordResetToken | null> {
    const row = await this.client.passwordResetToken.findUnique({
      where: { tokenHash: tokenFingerprint },
    });

    return row === null ? null : PasswordResetTokenMapper.toDomain(row);
  }

  async findPendingByUserId(userId: UniqueEntityId): Promise<readonly PasswordResetToken[]> {
    const rows = await this.client.passwordResetToken.findMany({
      where: { userId: userId.value, consumedAt: null },
    });

    return rows.map((row) => PasswordResetTokenMapper.toDomain(row));
  }
}
