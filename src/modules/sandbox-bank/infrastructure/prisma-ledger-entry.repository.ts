import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { LedgerEntry } from '../domain/ledger-entry.js';
import type {
  LedgerEntryRepository,
  StatementPage,
  StatementWindow,
} from '../domain/ledger-entry.repository.js';
import { SandboxBankMapper } from './sandbox-bank.mapper.js';

export class PrismaLedgerEntryRepository implements LedgerEntryRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(entry: LedgerEntry): Promise<void> {
    const row = SandboxBankMapper.entry.toRow(entry);

    await this.client.sandboxLedgerEntry.upsert({ where: { id: row.id }, create: row, update: row });
  }

  async findPageByAccountId(
    accountId: UniqueEntityId,
    window: StatementWindow,
    page: { readonly number: number; readonly size: number },
  ): Promise<StatementPage> {
    const where = {
      accountId: accountId.value,
      bookedAt: { gte: window.from, lte: window.to },
    };
    const [rows, totalRecords] = await Promise.all([
      this.client.sandboxLedgerEntry.findMany({
        where,
        orderBy: [{ bookedAt: 'desc' }, { id: 'desc' }],
        skip: (page.number - 1) * page.size,
        take: page.size,
      }),
      this.client.sandboxLedgerEntry.count({ where }),
    ]);

    return { entries: rows.map((row) => SandboxBankMapper.entry.toDomain(row)), totalRecords };
  }
}
