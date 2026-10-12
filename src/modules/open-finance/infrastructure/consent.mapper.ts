import type { Consent as ConsentRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Consent } from '../domain/consent.js';

export class ConsentMapper {
  static toDomain(row: ConsentRow): Consent {
    return Consent.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      externalConsentId: row.externalConsentId,
      status: row.status,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      lastSyncedAt: row.lastSyncedAt,
    });
  }

  static toRow(consent: Consent): ConsentRow {
    return {
      id: consent.id.value,
      userId: consent.userId.value,
      externalConsentId: consent.externalConsentId,
      status: consent.status,
      createdAt: consent.createdAt,
      expiresAt: consent.expiresAt,
      lastSyncedAt: consent.lastSyncedAt,
    };
  }
}
