import type { MonthKey } from '@shared/domain/calendar.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { CeilingAmount } from './ceiling-amount.js';
import { CeilingDestination } from './ceiling-destination.js';

interface CeilingTermProperties {
  readonly id: UniqueEntityId;
  readonly amount: CeilingAmount;
  readonly destination: CeilingDestination | null;
  /** The São Paulo month it starts governing. It governs every month after until replaced. */
  readonly effectiveFrom: MonthKey;
  readonly setAt: Date;
}

/**
 * One value of the ceiling and the months it governs. Kept, not overwritten,
 * when the user changes their mind: every closed month has to stay measured
 * against the ceiling that was in force in it, or the record would rewrite
 * itself each time the ceiling moved.
 */
export class CeilingTerm {
  private constructor(private readonly properties: CeilingTermProperties) {}

  static of(properties: CeilingTermProperties): CeilingTerm {
    return new CeilingTerm(properties);
  }

  get id(): UniqueEntityId {
    return this.properties.id;
  }

  get amount(): CeilingAmount {
    return this.properties.amount;
  }

  get destination(): CeilingDestination | null {
    return this.properties.destination;
  }

  get effectiveFrom(): MonthKey {
    return this.properties.effectiveFrom;
  }

  get setAt(): Date {
    return this.properties.setAt;
  }

  says(amount: CeilingAmount, destination: CeilingDestination | null): boolean {
    return this.amount.equals(amount) && CeilingDestination.same(this.destination, destination);
  }
}
