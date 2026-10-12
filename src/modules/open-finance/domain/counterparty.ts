import type { DomainError } from '@shared/domain/domain-error.js';
import { fail, ok, type Result } from '@shared/domain/result.js';

const MAXIMUM_LENGTH = 140;

export class InvalidCounterpartyError implements DomainError {
  readonly code = 'INVALID_COUNTERPARTY';
}

/**
 * The normalised merchant or payer name — **derived from** the statement line,
 * never the line itself. The raw description stays in `bet-detection`'s policy
 * input and reaches no response, no event and no log.
 */
export class Counterparty {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Counterparty, InvalidCounterpartyError> {
    const normalised = raw.trim().replace(/\s+/g, ' ');

    if (normalised.length === 0 || normalised.length > MAXIMUM_LENGTH) {
      return fail(new InvalidCounterpartyError());
    }

    return ok(new Counterparty(normalised));
  }

  static restore(value: string): Counterparty {
    const counterparty = Counterparty.create(value);

    if (!counterparty.ok) {
      throw new Error('Corrupted counterparty');
    }

    return counterparty.value;
  }
}
