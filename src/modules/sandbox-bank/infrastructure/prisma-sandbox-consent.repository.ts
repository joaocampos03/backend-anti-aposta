import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { SandboxBankMapper } from './sandbox-bank.mapper.js';

export class PrismaSandboxConsentRepository implements ConsentRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(consent: Consent): Promise<void> {
    const row = SandboxBankMapper.consent.toRow(consent);

    await this.client.sandboxConsent.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async findById(consentId: UniqueEntityId): Promise<Consent | null> {
    const row = await this.client.sandboxConsent.findUnique({ where: { id: consentId.value } });

    return row === null ? null : SandboxBankMapper.consent.toDomain(row);
  }

  async findByIdAndClientId(consentId: UniqueEntityId, clientId: string): Promise<Consent | null> {
    const row = await this.client.sandboxConsent.findFirst({
      where: { id: consentId.value, clientId },
    });

    return row === null ? null : SandboxBankMapper.consent.toDomain(row);
  }
}
