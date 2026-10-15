import type { OwnSpendingCategory } from '../../domain/spending-equivalence.js';

export interface MoneyDto {
  readonly amountInCents: number;
  readonly currency: 'BRL';
}

export interface OwnSpendingEquivalenceDto {
  readonly category: OwnSpendingCategory;
  readonly months: number;
  readonly monthlyAverage: MoneyDto;
  readonly completeMonthsCounted: number;
}

export interface ReferenceItemEquivalenceDto {
  readonly id: string;
  readonly singular: string;
  readonly plural: string;
  readonly quantity: number;
  readonly unitPrice: MoneyDto;
  /** `quantity × unitPrice`: the amount a goal for this card would aim at. */
  readonly target: MoneyDto;
  /** The São Paulo day the price was last reviewed, as `YYYY-MM-DD`. */
  readonly reviewedAt: string;
}

/**
 * The two kinds, kept apart on the wire.
 *
 * One is the reader's own spending and the other is a catalogue of
 * approximations. Interleaving them into a single list would blur which figures
 * came from their statement and which came from ours, and the detail line under
 * each card is the only thing that keeps that honest.
 */
export interface EquivalencesOutput {
  readonly ownSpending: readonly OwnSpendingEquivalenceDto[];
  readonly referenceItems: readonly ReferenceItemEquivalenceDto[];
}
