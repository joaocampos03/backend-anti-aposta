import type { PasswordResetToken as PasswordResetTokenRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { PasswordResetToken } from '../domain/password-reset-token.js';

export class PasswordResetTokenMapper {
  static toDomain(row: PasswordResetTokenRow): PasswordResetToken {
    return PasswordResetToken.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      tokenFingerprint: row.tokenHash,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    });
  }

  static toRow(token: PasswordResetToken): PasswordResetTokenRow {
    return {
      id: token.id.value,
      userId: token.userId.value,
      tokenHash: token.tokenFingerprint,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
    };
  }
}
