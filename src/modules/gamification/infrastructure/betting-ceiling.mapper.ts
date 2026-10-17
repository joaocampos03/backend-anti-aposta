import type {
  BettingCeiling as BettingCeilingRow,
  CeilingTerm as CeilingTermRow,
} from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BettingCeiling } from '../domain/betting-ceiling.js';
import { CeilingAmount } from '../domain/ceiling-amount.js';
import { CeilingDestination } from '../domain/ceiling-destination.js';
import { CeilingTerm } from '../domain/ceiling-term.js';

type BettingCeilingWithTerms = BettingCeilingRow & { readonly terms: readonly CeilingTermRow[] };

export class BettingCeilingMapper {
  /** Terms must arrive oldest first. */
  static toDomain(row: BettingCeilingWithTerms): BettingCeiling {
    return BettingCeiling.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      terms: row.terms.map((term) =>
        CeilingTerm.of({
          id: UniqueEntityId.restore(term.id),
          amount: CeilingAmount.restore(term.amountInCents),
          destination: CeilingDestination.restore(term.destination),
          effectiveFrom: term.effectiveFrom,
          setAt: term.setAt,
        }),
      ),
      createdAt: row.createdAt,
      version: row.version,
    });
  }

  static toRow(ceiling: BettingCeiling): BettingCeilingRow {
    return {
      id: ceiling.id.value,
      userId: ceiling.userId.value,
      createdAt: ceiling.createdAt,
      version: ceiling.version,
    };
  }

  static termRows(ceiling: BettingCeiling): CeilingTermRow[] {
    return ceiling.allTerms.map((term) => ({
      id: term.id.value,
      ceilingId: ceiling.id.value,
      amountInCents: term.amount.inCents,
      destination: term.destination?.value ?? null,
      effectiveFrom: term.effectiveFrom,
      setAt: term.setAt,
    }));
  }
}
