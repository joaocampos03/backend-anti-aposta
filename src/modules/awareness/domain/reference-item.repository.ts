import type { ReferenceItem } from './reference-item.js';

export interface ReferenceItemRepository {
  /**
   * The catalogue in use, priciest first — which is the order the card lists
   * them in. It is a handful of rows and every equivalence needs all of them,
   * so there is nothing to paginate and no question to narrow.
   */
  findActiveByPriceDescending(): Promise<readonly ReferenceItem[]>;
}
