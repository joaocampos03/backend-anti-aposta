import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { IssuedToken } from '../domain/issued-token.js';
import type { IssuedTokenRepository } from '../domain/issued-token.repository.js';
import { SandboxBankMapper } from './sandbox-bank.mapper.js';

export class PrismaIssuedTokenRepository implements IssuedTokenRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(token: IssuedToken): Promise<void> {
    const row = SandboxBankMapper.token.toRow(token);

    await this.client.sandboxIssuedToken.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async findByFingerprint(tokenFingerprint: string): Promise<IssuedToken | null> {
    const row = await this.client.sandboxIssuedToken.findUnique({ where: { tokenFingerprint } });

    return row === null ? null : SandboxBankMapper.token.toDomain(row);
  }

  async revokeAllForConsent(consentId: UniqueEntityId, moment: Date): Promise<void> {
    await this.client.sandboxIssuedToken.updateMany({
      where: { consentId: consentId.value, revokedAt: null },
      data: { revokedAt: moment },
    });
  }
}
