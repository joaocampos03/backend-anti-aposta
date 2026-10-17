import type { MonthKey } from '@shared/domain/calendar.js';
import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { CeilingAmount } from './ceiling-amount.js';
import type { CeilingDestination } from './ceiling-destination.js';
import { CeilingTerm } from './ceiling-term.js';
import { BettingCeilingSet } from './events/betting-ceiling-set.js';

interface BettingCeilingProperties {
  readonly userId: UniqueEntityId;
  /** Oldest first; `effectiveFrom` strictly increasing. */
  readonly terms: readonly CeilingTerm[];
  readonly createdAt: Date;
  readonly version: number;
}

export interface CeilingChoice {
  readonly termId: UniqueEntityId;
  readonly amount: CeilingAmount;
  readonly destination: CeilingDestination | null;
  readonly setAt: Date;
  readonly currentMonth: MonthKey;
  readonly nextMonth: MonthKey;
}

/**
 * The user's monthly ceiling on betting spend, and every value it has had.
 *
 * Both halves of the choice are the user's — the amount and what the money is
 * for — which is the autonomy half of the SDT mapping; the months measured
 * against it are the competence half. Nothing here is measured: a ceiling is a
 * decision, and the month's outcome is computed on read from the statement, so
 * a correction to a classification moves the outcome with it.
 *
 * **The month under way keeps the ceiling it started with.** Moving a ceiling
 * mid-month would rewrite an outcome the person is living through, so a
 * replacement waits for the first day of the next month. The first ceiling is
 * the exception: there is no outcome under way to rewrite.
 */
export class BettingCeiling extends AggregateRoot {
  private terms: readonly CeilingTerm[];

  private constructor(
    id: UniqueEntityId,
    private readonly properties: BettingCeilingProperties,
  ) {
    super(id);
    this.terms = properties.terms;
  }

  static open(input: {
    readonly id: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly createdAt: Date;
  }): BettingCeiling {
    return new BettingCeiling(input.id, { ...input, terms: [], version: 0 });
  }

  static restore(id: UniqueEntityId, properties: BettingCeilingProperties): BettingCeiling {
    const ordered = properties.terms.every(
      (term, index) => index === 0 || term.effectiveFrom > (properties.terms[index - 1]?.effectiveFrom ?? ''),
    );

    if (!ordered) {
      throw new Error(`Corrupted gamification_ceiling_terms order: ${id.value}`);
    }

    return new BettingCeiling(id, properties);
  }

  /** Returns the month from which the chosen value governs. */
  choose(choice: CeilingChoice): MonthKey {
    const governing = this.governing(choice.currentMonth);
    this.terms = this.terms.filter((term) => term.effectiveFrom <= choice.currentMonth);

    if (governing?.says(choice.amount, choice.destination)) {
      return choice.currentMonth;
    }

    const effectiveFrom = governing === null ? choice.currentMonth : choice.nextMonth;
    this.terms = [...this.terms, CeilingTerm.of({ ...this.termOf(choice), effectiveFrom })];
    this.addEvent(
      new BettingCeilingSet({
        userId: this.userId,
        ceilingId: this.id,
        effectiveFromMonthKey: effectiveFrom,
        setAt: choice.setAt,
      }),
    );

    return effectiveFrom;
  }

  /** The term in force in that month, or `null` before the first ceiling. */
  governing(monthKey: MonthKey): CeilingTerm | null {
    return this.terms.findLast((term) => term.effectiveFrom <= monthKey) ?? null;
  }

  /** The replacement waiting for a month after this one, if any. */
  scheduledAfter(monthKey: MonthKey): CeilingTerm | null {
    return this.terms.find((term) => term.effectiveFrom > monthKey) ?? null;
  }

  get allTerms(): readonly CeilingTerm[] {
    return this.terms;
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }

  get version(): number {
    return this.properties.version;
  }

  private termOf(choice: CeilingChoice) {
    return {
      id: choice.termId,
      amount: choice.amount,
      destination: choice.destination,
      setAt: choice.setAt,
    };
  }
}
