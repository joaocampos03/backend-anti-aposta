import type {
  DetectionConfidence,
  DetectionReason,
} from '../../domain/bet-classification.js';
import type { RegistryStatus } from '../../domain/bookmaker-identity.js';
import type { BettingSyncStatus } from '../ports/betting-ledger-reader.port.js';


/** The four windows the screen offers, and nothing the client can widen. */
export type BetWindowInDays = 30 | 90 | 180 | 360;

export interface SummariseBettingInput {
  readonly userId: string;
  readonly days: BetWindowInDays;
}

export interface MoneyDto {
  readonly amountInCents: number;
  readonly currency: 'BRL';
}

export interface BetWindowDto {
  readonly days: number;
  /** São Paulo calendar keys, so no client re-derives a day from an instant. */
  readonly fromDayKey: string;
  readonly toDayKey: string;
}

export interface RefundsDto {
  readonly total: MoneyDto;
  readonly count: number;
}

export interface BettingCostDto {
  /** Net of refunds, floored at zero. */
  readonly total: MoneyDto;
  /** Bets placed. A refund is not one. */
  readonly transactionCount: number;
  readonly bookmakerCount: number;
  readonly firstBetAt: string | null;
  readonly refunds: RefundsDto;
}

export interface YieldDto {
  readonly betYieldEquivalent: MoneyDto;
  /** The rate `awareness` holds. An unlabelled projection is a made-up number. */
  readonly annualRatePercent: number;
}

export interface IncomeShareDto {
  readonly income: MoneyDto;
  /**
   * An integer, and **not** capped at 100. Above 100 is a factual statement
   * about the window, not something to soften.
   */
  readonly percentage: number;
}

export interface BookmakerDetectionDto {
  readonly matchedBy: DetectionReason;
  readonly count: number;
  readonly lowestConfidence: DetectionConfidence;
}

export interface BookmakerSummaryDto {
  readonly bookmakerId: string;
  readonly name: string;
  readonly registryStatus: RegistryStatus;
  readonly total: MoneyDto;
  readonly transactionCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly weakest: { readonly matchedBy: DetectionReason; readonly confidence: DetectionConfidence };
  readonly detections: readonly BookmakerDetectionDto[];
}

export interface DetectionTallyDto {
  readonly matchedBy: DetectionReason;
  readonly count: number;
  /** Rounded independently, so the shares may sum to 99 or 101. */
  readonly sharePercent: number;
}

export interface HourBucketDto {
  readonly startHour: number;
  readonly count: number;
}

export interface OwnSpendingEquivalenceDto {
  readonly category: string;
  readonly months: number;
  readonly monthlyAverage: MoneyDto;
  /** What the average covers, so the detail line can stay honest about it. */
  readonly completeMonthsCounted: number;
}

export interface ReferenceItemEquivalenceDto {
  readonly id: string;
  readonly singular: string;
  readonly plural: string;
  readonly quantity: number;
  readonly unitPrice: MoneyDto;
  /** `quantity × unitPrice`: exactly what a goal for this card would aim at. */
  readonly target: MoneyDto;
  readonly reviewedAt: string;
}

/** The two kinds, kept apart: one is the reader's own money, one is a catalogue. */
export interface EquivalencesDto {
  readonly ownSpending: readonly OwnSpendingEquivalenceDto[];
  readonly referenceItems: readonly ReferenceItemEquivalenceDto[];
}

/**
 * Everything the betting screen shows for one window.
 *
 * A single aggregate rather than a collection, so its bounded nested lists are
 * plain arrays. The one unbounded list — a bookmaker's transactions — is served
 * by the statement, which pages.
 *
 * @see docs/features/bets.md
 */
export interface BettingSummaryOutput {
  readonly syncStatus: BettingSyncStatus;
  readonly window: BetWindowDto;
  readonly cost: BettingCostDto;
  readonly yield: YieldDto;
  /** `null` when there were no `INCOME` credits in the window. */
  readonly incomeShare: IncomeShareDto | null;
  readonly equivalences: EquivalencesDto;
  readonly bookmakers: readonly BookmakerSummaryDto[];
  readonly detectionTallies: readonly DetectionTallyDto[];
  /** Always eight, `startHour` 0 to 21 in steps of 3, zeros included. */
  readonly hourBuckets: readonly HourBucketDto[];
}
