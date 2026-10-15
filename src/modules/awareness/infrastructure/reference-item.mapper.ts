import type { ReferenceItem as ReferenceItemRow } from '@prisma/client';
import { Money } from '@shared/domain/money.js';
import { ReferenceItem } from '../domain/reference-item.js';

export class ReferenceItemMapper {
  static toDomain(row: ReferenceItemRow): ReferenceItem {
    return ReferenceItem.of({
      id: row.id,
      singular: row.singular,
      plural: row.plural,
      unitPrice: Money.restore(row.unitPriceInCents),
      source: row.source,
      reviewedAt: row.reviewedAt,
    });
  }
}
