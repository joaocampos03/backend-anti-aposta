import type { BetMark } from '../../domain/transaction.js';

/**
 * `bet-detection`'s current verdict for one transaction, read when the
 * projection on the row has to be refreshed.
 */
export interface ProjectedVerdict {
  readonly bet: BetMark | null;
  readonly overriddenAt: Date | null;
}

export interface ClassificationReader {
  effectiveFor(transactionId: string, userId: string): Promise<ProjectedVerdict | null>;
}
