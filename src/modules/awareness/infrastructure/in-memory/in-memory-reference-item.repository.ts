import type { ReferenceItem } from '../../domain/reference-item.js';
import type { ReferenceItemRepository } from '../../domain/reference-item.repository.js';

export class InMemoryReferenceItemRepository implements ReferenceItemRepository {
  private items: readonly ReferenceItem[] = [];

  /** Arrange: the catalogue as it stands when the next equivalence is described. */
  stock(...items: readonly ReferenceItem[]): void {
    this.items = [...this.items, ...items];
  }

  async findActiveByPriceDescending(): Promise<readonly ReferenceItem[]> {
    return [...this.items].sort(
      (left, right) =>
        right.unitPrice.amountInCents - left.unitPrice.amountInCents ||
        left.id.localeCompare(right.id),
    );
  }
}
