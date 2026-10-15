import type { Money } from '@shared/domain/money.js';
import type { DetectionConfidence, DetectionReason } from './bet-classification.js';
import type { BookmakerIdentity } from './bookmaker-identity.js';

/**
 * One classified transaction, as every figure on the betting screen sees it.
 *
 * The amount keeps its sign. A debit is a bet placed and a credit is money the
 * house gave back, and the difference decides whether it adds to the cost or
 * subtracts from it — so nothing here takes a magnitude.
 */
export class BetEntry {
  private constructor(
    readonly occurredAt: Date,
    readonly amount: Money,
    readonly bookmaker: BookmakerIdentity,
    readonly matchedBy: DetectionReason,
    readonly confidence: DetectionConfidence,
  ) {}

  static of(input: {
    readonly occurredAt: Date;
    readonly amount: Money;
    readonly bookmaker: BookmakerIdentity;
    readonly matchedBy: DetectionReason;
    readonly confidence: DetectionConfidence;
  }): BetEntry {
    return new BetEntry(
      input.occurredAt,
      input.amount,
      input.bookmaker,
      input.matchedBy,
      input.confidence,
    );
  }

  /** A bet placed. This is what the counts, the tallies and the hours describe. */
  get isBetPlaced(): boolean {
    return this.amount.isDebit();
  }

  /** Money the house gave back: netted into the totals, counted as no bet. */
  get isRefund(): boolean {
    return this.amount.isCredit();
  }

  get bookmakerId(): string {
    return this.bookmaker.bookmakerId.value;
  }
}
