import type {
  ClassificationSource,
  DetectionConfidence,
  DetectionReason,
} from '../../domain/bet-classification.js';

export interface ReclassifyTransactionInput {
  readonly userId: string;
  readonly transactionId: string;
  /** Free text the person typed. Shown to nobody, logged nowhere. */
  readonly reason?: string | undefined;
}

export interface RevertReclassificationInput {
  readonly userId: string;
  readonly transactionId: string;
}

export interface BetDto {
  readonly matchedBy: DetectionReason;
  readonly confidence: DetectionConfidence;
  readonly source: ClassificationSource;
}

export interface MoneyDto {
  readonly amountInCents: number;
  readonly currency: 'BRL';
}

export interface OverrideDto {
  readonly verdict: 'NOT_A_BET';
  readonly overriddenAt: string;
  readonly isReversible: boolean;
}

/**
 * The corrected row, returned so the dialog can re-render without a refetch.
 * The collection is revalidated separately, because the totals, the monthly
 * summary, the streak, the ceiling and the support offer all change too.
 */
export interface ClassificationOutput {
  readonly transaction: {
    readonly id: string;
    readonly bet: BetDto | null;
    readonly yieldEquivalent: MoneyDto | null;
  };
  readonly override: OverrideDto | null;
}
