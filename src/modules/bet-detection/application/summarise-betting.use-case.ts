import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Calendar } from '@shared/domain/calendar.js';
import { Money } from '@shared/domain/money.js';
import { ok, type Result } from '@shared/domain/result.js';
import { BetEntry } from '../domain/bet-entry.js';
import type { BettingCost } from '../domain/betting-cost.js';
import { BetWindow, BettingSummary } from '../domain/betting-summary.js';
import { BookmakerIdentity } from '../domain/bookmaker-identity.js';
import type { BookmakerStanding } from '../domain/bookmaker-standing.js';
import type {
  BettingCostDto,
  BettingSummaryOutput,
  BookmakerSummaryDto,
  EquivalencesDto,
  IncomeShareDto,
  MoneyDto,
  SummariseBettingInput,
} from './dto/betting-summary.dto.js';
import type {
  BettingLedgerReader,
  BettingSyncStatus,
  LedgerBetEntry,
} from './ports/betting-ledger-reader.port.js';
import type {
  BookmakerIdentityQuery,
  BookmakerIdentityRow,
} from './ports/bookmaker-identity.query.port.js';
import type {
  EquivalenceReader,
  SpendingEquivalencesView,
} from './ports/equivalence-reader.port.js';
import type { YieldCalculator } from './ports/yield-calculator.port.js';

const PERCENT = 100;

export interface SummariseBettingDependencies {
  readonly ledger: BettingLedgerReader;
  readonly identities: BookmakerIdentityQuery;
  readonly equivalences: EquivalenceReader;
  readonly yields: YieldCalculator;
  readonly calendar: Calendar;
  readonly clock: Clock;
}

/**
 * The betting screen, computed on read.
 *
 * It composes three contexts without any of them reaching into another: the
 * movements and the income come from `open-finance` through its public API, the
 * rate and the equivalences from `awareness` through its own, and the verdicts,
 * the grouping and every count are this context's.
 *
 * Two properties are load-bearing and both are tested: every figure describes
 * the **same** window, and the betting total equals the statement's
 * `totals.betSpend` for that window to the cent. Two screens that disagree
 * about the same money discredit both of them.
 *
 * @see docs/features/bets.md
 */
export class SummariseBetting implements UseCase<SummariseBettingInput, BettingSummaryOutput> {
  constructor(private readonly dependencies: SummariseBettingDependencies) {}

  async execute(input: SummariseBettingInput): Promise<Result<BettingSummaryOutput, AppError>> {
    const window = BetWindow.of(
      input.days,
      this.dependencies.clock.now(),
      this.dependencies.calendar,
    );
    const syncStatus = await this.dependencies.ledger.syncStatusOf(input.userId);

    if (syncStatus === 'NO_CONSENT') {
      return ok(this.nothingToShow(syncStatus, window));
    }

    return ok(await this.describe(input, syncStatus, window));
  }

  /**
   * No consent means no figures at all. A zero here would read as "you spent
   * nothing on bets", which is a claim the data does not support — the product
   * has never seen this person's statement.
   */
  private nothingToShow(
    syncStatus: BettingSyncStatus,
    window: BetWindow,
  ): BettingSummaryOutput {
    return this.present(syncStatus, BettingSummary.empty(window), null, {
      ownSpending: [],
      referenceItems: [],
    });
  }

  private async describe(
    input: SummariseBettingInput,
    syncStatus: BettingSyncStatus,
    window: BetWindow,
  ): Promise<BettingSummaryOutput> {
    const [rows, identities] = await Promise.all([
      this.dependencies.ledger.entriesSince(input.userId, window.startsAt),
      this.dependencies.identities.forUserId(input.userId),
    ]);

    const summary = BettingSummary.of({
      window,
      entries: rows.map((row) => this.entryFrom(row, identities)),
      calendar: this.dependencies.calendar,
    });

    const [income, equivalences] = await Promise.all([
      this.dependencies.ledger.incomeInCentsSince(input.userId, window.startsAt),
      this.dependencies.equivalences.equivalencesFor(
        input.userId,
        summary.cost.total.amountInCents,
      ),
    ]);

    return this.present(
      syncStatus,
      summary,
      this.incomeShareOf(summary.cost, income),
      this.presentEquivalences(equivalences),
    );
  }

  /**
   * The name comes from this context's own table. A row classified before the
   * product knew how to attribute one has no grouping of its own, and it still
   * has to be counted: dropping it would make this total disagree with the
   * statement's.
   */
  private entryFrom(
    row: LedgerBetEntry,
    identities: readonly BookmakerIdentityRow[],
  ): BetEntry {
    const found = identities.find((identity) => identity.bookmakerId === row.bookmakerId);

    return BetEntry.of({
      occurredAt: row.occurredAt,
      amount: Money.restore(row.amountInCents),
      bookmaker:
        found === undefined
          ? BookmakerIdentity.unattributed()
          : BookmakerIdentity.restore(found),
      matchedBy: row.matchedBy,
      confidence: row.confidence,
    });
  }

  /** Hidden rather than shown as zero: a share of nothing is not a figure. */
  private incomeShareOf(cost: BettingCost, incomeInCents: number): IncomeShareDto | null {
    if (incomeInCents <= 0) {
      return null;
    }

    return {
      income: money(incomeInCents),
      percentage: Math.round((cost.total.amountInCents / incomeInCents) * PERCENT),
    };
  }

  private present(
    syncStatus: BettingSyncStatus,
    summary: BettingSummary,
    incomeShare: IncomeShareDto | null,
    equivalences: EquivalencesDto,
  ): BettingSummaryOutput {
    const reframed = this.dependencies.yields.reframe(summary.cost.total.amountInCents);

    return {
      syncStatus,
      window: {
        days: summary.window.days,
        fromDayKey: summary.window.fromDayKey,
        toDayKey: summary.window.toDayKey,
      },
      cost: presentCost(summary.cost),
      yield: {
        betYieldEquivalent: money(reframed.futureValueInCents),
        annualRatePercent: reframed.annualRatePercent,
      },
      incomeShare,
      equivalences,
      bookmakers: summary.bookmakers.map((standing) => presentBookmaker(standing)),
      detectionTallies: summary.detectionTallies.map((tally) => ({
        matchedBy: tally.matchedBy,
        count: tally.count,
        sharePercent: tally.sharePercent,
      })),
      hourBuckets: summary.hourBuckets.map((bucket) => ({
        startHour: bucket.startHour,
        count: bucket.count,
      })),
    };
  }

  private presentEquivalences(equivalences: SpendingEquivalencesView): EquivalencesDto {
    return {
      ownSpending: equivalences.ownSpending.map((own) => ({
        category: own.category,
        months: own.months,
        monthlyAverage: money(own.monthlyAverageInCents),
        completeMonthsCounted: own.completeMonthsCounted,
      })),
      referenceItems: equivalences.referenceItems.map((item) => ({
        id: item.id,
        singular: item.singular,
        plural: item.plural,
        quantity: item.quantity,
        unitPrice: money(item.unitPriceInCents),
        target: money(item.targetInCents),
        reviewedAt: item.reviewedAt,
      })),
    };
  }
}

function money(amountInCents: number): MoneyDto {
  return { amountInCents, currency: 'BRL' };
}

function presentCost(cost: BettingCost): BettingCostDto {
  return {
    total: money(cost.total.amountInCents),
    transactionCount: cost.transactionCount,
    bookmakerCount: cost.bookmakerCount,
    firstBetAt: cost.firstBetAt?.toISOString() ?? null,
    refunds: { total: money(cost.refundTotal.amountInCents), count: cost.refundCount },
  };
}

function presentBookmaker(standing: BookmakerStanding): BookmakerSummaryDto {
  return {
    bookmakerId: standing.bookmaker.bookmakerId.value,
    name: standing.bookmaker.name,
    registryStatus: standing.bookmaker.registryStatus,
    total: money(standing.total.amountInCents),
    transactionCount: standing.transactionCount,
    firstSeenAt: standing.firstSeenAt.toISOString(),
    lastSeenAt: standing.lastSeenAt.toISOString(),
    weakest: standing.weakest,
    detections: standing.detections.map((detection) => ({
      matchedBy: detection.matchedBy,
      count: detection.count,
      lowestConfidence: detection.lowestConfidence,
    })),
  };
}
