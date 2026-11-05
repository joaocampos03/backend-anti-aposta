import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { ConsentMapper } from './consent.mapper.js';

export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(consent: Consent): Promise<void> {
    const row = ConsentMapper.toRow(consent);

    await this.client.consent.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async findByIdAndUserId(
    consentId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<Consent | null> {
    const row = await this.client.consent.findFirst({
      where: { id: consentId.value, userId: userId.value },
    });

    return row === null ? null : ConsentMapper.toDomain(row);
  }

  async findAuthorisedByUserId(userId: UniqueEntityId, moment: Date): Promise<Consent | null> {
    const row = await this.client.consent.findFirst({
      where: { userId: userId.value, status: 'AUTHORISED', expiresAt: { gt: moment } },
      orderBy: { createdAt: 'desc' },
    });

    return row === null ? null : ConsentMapper.toDomain(row);
  }

  async findByExternalConsentId(externalConsentId: string): Promise<Consent | null> {
    const row = await this.client.consent.findFirst({
      where: { externalConsentId },
      orderBy: { createdAt: 'desc' },
    });

    return row === null ? null : ConsentMapper.toDomain(row);
  }

  async findAllByUserId(userId: UniqueEntityId): Promise<readonly Consent[]> {
    const rows = await this.client.consent.findMany({ where: { userId: userId.value } });

    return rows.map((row) => ConsentMapper.toDomain(row));
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    await this.client.consent.deleteMany({ where: { userId: userId.value } });
  }

  async findLatestByUserId(userId: UniqueEntityId): Promise<Consent | null> {
    const row = await this.client.consent.findFirst({
      where: { userId: userId.value },
      orderBy: { createdAt: 'desc' },
    });

    return row === null ? null : ConsentMapper.toDomain(row);
  }
}
