import type {
  EquivalenceReader,
  SpendingEquivalencesView,
} from '../../application/ports/equivalence-reader.port.js';

export class InMemoryEquivalenceReader implements EquivalenceReader {
  /** What the last call was asked to divide, so a test can assert on it. */
  lastTotalInCents: number | null = null;

  private view: SpendingEquivalencesView = { ownSpending: [], referenceItems: [] };

  stock(view: SpendingEquivalencesView): void {
    this.view = view;
  }

  async equivalencesFor(
    _userId: string,
    totalInCents: number,
  ): Promise<SpendingEquivalencesView> {
    this.lastTotalInCents = totalInCents;

    return this.view;
  }
}
