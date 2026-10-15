export interface OwnSpendingEquivalenceView {
  readonly category: string;
  readonly months: number;
  readonly monthlyAverageInCents: number;
  readonly completeMonthsCounted: number;
}

export interface ReferenceItemEquivalenceView {
  readonly id: string;
  readonly singular: string;
  readonly plural: string;
  readonly quantity: number;
  readonly unitPriceInCents: number;
  readonly targetInCents: number;
  readonly reviewedAt: string;
}

export interface SpendingEquivalencesView {
  readonly ownSpending: readonly OwnSpendingEquivalenceView[];
  readonly referenceItems: readonly ReferenceItemEquivalenceView[];
}

/**
 * What `awareness` answers: one betting total, said in something other than
 * money.
 *
 * The equivalences travel with the total they divide, in one response, so the
 * two can never be fetched out of step and show a quantity that belongs to a
 * different amount.
 */
export interface EquivalenceReader {
  equivalencesFor(userId: string, totalInCents: number): Promise<SpendingEquivalencesView>;
}
