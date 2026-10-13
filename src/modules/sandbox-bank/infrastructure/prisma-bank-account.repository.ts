import type { Prisma } from '@prisma/client';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { BankAccount } from '../domain/bank-account.js';
import type { BankAccountRepository } from '../domain/bank-account.repository.js';
import { SandboxBankMapper } from './sandbox-bank.mapper.js';

/**
 * Postgres sorts an enum by its declared order, so the checking account comes
 * before the card on every screen, whatever the uuids happen to be.
 */
const ACCOUNT_ORDER: Prisma.SandboxBankAccountOrderByWithRelationInput[] = [
  { type: 'asc' },
  { openedAt: 'asc' },
  { id: 'asc' },
];

export class PrismaBankAccountRepository implements BankAccountRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(account: BankAccount): Promise<void> {
    const row = SandboxBankMapper.account.toRow(account);

    await this.client.sandboxBankAccount.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async findByCustomerId(customerId: UniqueEntityId): Promise<readonly BankAccount[]> {
    const rows = await this.client.sandboxBankAccount.findMany({
      where: { customerId: customerId.value },
      orderBy: ACCOUNT_ORDER,
    });

    return rows.map((row) => SandboxBankMapper.account.toDomain(row));
  }

  async findByIdAndCustomerId(
    accountId: UniqueEntityId,
    customerId: UniqueEntityId,
  ): Promise<BankAccount | null> {
    const row = await this.client.sandboxBankAccount.findFirst({
      where: { id: accountId.value, customerId: customerId.value },
    });

    return row === null ? null : SandboxBankMapper.account.toDomain(row);
  }

  async findByIds(accountIds: readonly UniqueEntityId[]): Promise<readonly BankAccount[]> {
    const rows = await this.client.sandboxBankAccount.findMany({
      where: { id: { in: accountIds.map((id) => id.value) } },
      orderBy: ACCOUNT_ORDER,
    });

    return rows.map((row) => SandboxBankMapper.account.toDomain(row));
  }
}
