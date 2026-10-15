import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { ReferenceItem } from '../domain/reference-item.js';
import type { ReferenceItemRepository } from '../domain/reference-item.repository.js';
import { ReferenceItemMapper } from './reference-item.mapper.js';

export class PrismaReferenceItemRepository implements ReferenceItemRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async findActiveByPriceDescending(): Promise<readonly ReferenceItem[]> {
    const rows = await this.client.referenceItem.findMany({
      where: { isActive: true },
      // The id breaks a price tie, so two items at the same price keep one order
      // between requests instead of swapping places on the card.
      orderBy: [{ unitPriceInCents: 'desc' }, { id: 'asc' }],
    });

    return rows.map((row) => ReferenceItemMapper.toDomain(row));
  }
}
