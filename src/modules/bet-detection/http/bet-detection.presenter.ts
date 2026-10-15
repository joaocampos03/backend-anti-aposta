import type { BettingSummaryOutput } from '../application/dto/betting-summary.dto.js';
import type { ClassificationOutput } from '../application/dto/override.dto.js';

/**
 * Domain-free, and deliberately explicit: every field is spelled out, because a
 * screen is written against this shape and a spread from a DTO that grows would
 * ship a field nobody decided to send.
 */
export class BetDetectionPresenter {
  static classification(output: ClassificationOutput): unknown {
    return {
      transaction: {
        id: output.transaction.id,
        bet: output.transaction.bet,
        yieldEquivalent: output.transaction.yieldEquivalent,
      },
      override: output.override,
    };
  }

  /** No CNPJ, no statement line and no account number: check the list below. */
  static bettingSummary(output: BettingSummaryOutput): unknown {
    return {
      syncStatus: output.syncStatus,
      window: {
        days: output.window.days,
        fromDayKey: output.window.fromDayKey,
        toDayKey: output.window.toDayKey,
      },
      cost: {
        total: output.cost.total,
        transactionCount: output.cost.transactionCount,
        bookmakerCount: output.cost.bookmakerCount,
        firstBetAt: output.cost.firstBetAt,
        refunds: { total: output.cost.refunds.total, count: output.cost.refunds.count },
      },
      yield: {
        betYieldEquivalent: output.yield.betYieldEquivalent,
        annualRatePercent: output.yield.annualRatePercent,
      },
      incomeShare:
        output.incomeShare === null
          ? null
          : {
              income: output.incomeShare.income,
              percentage: output.incomeShare.percentage,
            },
      equivalences: {
        ownSpending: output.equivalences.ownSpending.map((own) => ({
          category: own.category,
          months: own.months,
          monthlyAverage: own.monthlyAverage,
          completeMonthsCounted: own.completeMonthsCounted,
        })),
        referenceItems: output.equivalences.referenceItems.map((item) => ({
          id: item.id,
          singular: item.singular,
          plural: item.plural,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          target: item.target,
          reviewedAt: item.reviewedAt,
        })),
      },
      bookmakers: output.bookmakers.map((bookmaker) => ({
        bookmakerId: bookmaker.bookmakerId,
        name: bookmaker.name,
        registryStatus: bookmaker.registryStatus,
        total: bookmaker.total,
        transactionCount: bookmaker.transactionCount,
        firstSeenAt: bookmaker.firstSeenAt,
        lastSeenAt: bookmaker.lastSeenAt,
        weakest: {
          matchedBy: bookmaker.weakest.matchedBy,
          confidence: bookmaker.weakest.confidence,
        },
        detections: bookmaker.detections.map((detection) => ({
          matchedBy: detection.matchedBy,
          count: detection.count,
          lowestConfidence: detection.lowestConfidence,
        })),
      })),
      detectionTallies: output.detectionTallies.map((tally) => ({
        matchedBy: tally.matchedBy,
        count: tally.count,
        sharePercent: tally.sharePercent,
      })),
      hourBuckets: output.hourBuckets.map((bucket) => ({
        startHour: bucket.startHour,
        count: bucket.count,
      })),
    };
  }
}
