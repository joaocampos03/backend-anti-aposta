import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { AuthorisationCode } from '../domain/authorisation-code.js';
import type { AuthorisationCodeRepository } from '../domain/authorisation-code.repository.js';
import { SandboxBankMapper } from './sandbox-bank.mapper.js';

export class PrismaAuthorisationCodeRepository implements AuthorisationCodeRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(code: AuthorisationCode): Promise<void> {
    const row = SandboxBankMapper.code.toRow(code);

    await this.client.sandboxAuthorisationCode.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }

  async findByFingerprint(codeFingerprint: string): Promise<AuthorisationCode | null> {
    const row = await this.client.sandboxAuthorisationCode.findUnique({
      where: { codeFingerprint },
    });

    return row === null ? null : SandboxBankMapper.code.toDomain(row);
  }
}
