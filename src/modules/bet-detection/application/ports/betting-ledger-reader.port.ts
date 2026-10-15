import type { DetectionConfidence, DetectionReason } from '../../domain/bet-classification.js';

/** The same three states the statement reports, restated: a port owns its shape. */
export type BettingSyncStatus = 'NO_CONSENT' | 'SYNCING' | 'READY';

export interface LedgerBetEntry {
  readonly occurredAt: Date;
  /** Signed: negative is a bet placed, positive is a refund. */
  readonly amountInCents: number;
  readonly bookmakerId: string | null;
  readonly matchedBy: DetectionReason;
  readonly confidence: DetectionConfidence;
}

/**
 * What `bet-detection` asks `open-finance` for: the amounts and the instants
 * behind its own verdicts, and the income the share is taken against.
 *
 * The movements are that context's, so they are read through its public API and
 * never by a join. The verdict on each row is this context's own, projected
 * there — which is what makes the betting screen's total and the statement's
 * total the same number rather than two numbers that usually agree.
 */
export interface BettingLedgerReader {
  syncStatusOf(userId: string): Promise<BettingSyncStatus>;
  entriesSince(userId: string, from: Date): Promise<readonly LedgerBetEntry[]>;
  /** `INCOME` credits only, over the same window. */
  incomeInCentsSince(userId: string, from: Date): Promise<number>;
}
