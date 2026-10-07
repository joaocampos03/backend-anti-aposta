import type { Session as SessionRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Session } from '../domain/session.js';

export class SessionMapper {
  static toDomain(row: SessionRow): Session {
    return Session.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      tokenFingerprint: row.tokenHash,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
    });
  }

  static toRow(session: Session): SessionRow {
    return {
      id: session.id.value,
      userId: session.userId.value,
      tokenHash: session.tokenFingerprint,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
      revokedAt: session.revokedAt,
    };
  }
}
