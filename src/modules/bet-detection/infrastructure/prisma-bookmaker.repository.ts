import type { Bookmaker as BookmakerRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { BookmakerRegistryReader } from '../application/ports/bookmaker-registry-reader.port.js';
import { Bookmaker } from '../domain/bookmaker.js';
import type { BookmakerRepository } from '../domain/bookmaker.repository.js';
import { BookmakerRegistry } from '../domain/bookmaker-registry.js';
import { Cnpj } from '../domain/cnpj.js';

function toDomain(row: BookmakerRow): Bookmaker | null {
  const document = Cnpj.create(row.document);

  if (!document.ok) {
    return null;
  }

  return Bookmaker.register({
    id: UniqueEntityId.restore(row.id),
    tradeName: row.tradeName,
    document: document.value,
    registeredAt: row.registeredAt,
  });
}

export class PrismaBookmakerRepository implements BookmakerRepository, BookmakerRegistryReader {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(bookmaker: Bookmaker): Promise<void> {
    const row: BookmakerRow = {
      id: bookmaker.id.value,
      tradeName: bookmaker.tradeName,
      document: bookmaker.document.digits,
      registeredAt: bookmaker.registeredAt,
    };

    await this.client.bookmaker.upsert({
      where: { document: row.document },
      create: row,
      update: row,
    });
  }

  async findAllRegistered(): Promise<readonly Bookmaker[]> {
    const rows = await this.client.bookmaker.findMany({ orderBy: { tradeName: 'asc' } });

    return rows.map((row) => toDomain(row)).filter((bookmaker) => bookmaker !== null);
  }

  /** Resolved fresh on every run, so an undone correction sees today's registry. */
  async current(): Promise<BookmakerRegistry> {
    const bookmakers = await this.findAllRegistered();

    return BookmakerRegistry.of(bookmakers.map((bookmaker) => bookmaker.document));
  }
}
