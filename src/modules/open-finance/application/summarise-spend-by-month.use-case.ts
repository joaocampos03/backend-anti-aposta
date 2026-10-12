import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Calendar } from '@shared/domain/calendar.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import {
  INCOMING_CATEGORY,
  TRANSACTION_CATEGORIES,
  type TransactionCategory,
} from '../domain/transaction-attributes.js';
import type {
  MonthlySummaryOutput,
  MonthlyTotalsDto,
  SummariseSpendByMonthInput,
} from './dto/monthly-summary.dto.js';
import type {
  MonthlyBucketTotal,
  MonthlySpendQuery,
} from './ports/monthly-spend.query.port.js';

export interface SummariseSpendByMonthDependencies {
  readonly consents: ConsentRepository;
  readonly monthlySpend: MonthlySpendQuery;
  readonly calendar: Calendar;
  readonly clock: Clock;
}

/**
 * The charts: per-calendar-month totals per category, newest first.
 *
 * Months with no data are **omitted** rather than zero-filled. A twelve-bar
 * chart of zeros reads as "you have never bet", which for somebody with four
 * months of history is a claim the data does not support.
 *
 * Every figure is a non-negative magnitude: the category says which direction
 * it points, so the charts never have to strip a sign. `TOTAL_SPENT` is
 * deliberately absent — it is the sum of the others, and sending it would
 * create a figure that could disagree with its own parts.
 *
 * @see docs/features/transactions.md
 */
export class SummariseSpendByMonth
  implements UseCase<SummariseSpendByMonthInput, MonthlySummaryOutput>
{
  constructor(private readonly dependencies: SummariseSpendByMonthDependencies) {}

  async execute(
    input: SummariseSpendByMonthInput,
  ): Promise<Result<MonthlySummaryOutput, AppError>> {
    const now = this.dependencies.clock.now();
    const consent = await this.dependencies.consents.findLatestByUserId(
      UniqueEntityId.restore(input.userId),
    );
    const syncStatus = consent === null ? 'NO_CONSENT' : consent.syncStatusAt(now);

    if (syncStatus === 'NO_CONSENT') {
      return ok({ syncStatus, currency: 'BRL', items: [], nextCursor: null });
    }

    const monthKeys = this.dependencies.calendar.recentMonthKeys(now, input.months);
    const oldest = monthKeys[monthKeys.length - 1] ?? this.dependencies.calendar.monthKeyOf(now);
    const totals = await this.dependencies.monthlySpend.totalsByMonth(
      input.userId,
      this.dependencies.calendar.startOfMonth(oldest),
    );

    return ok({
      syncStatus,
      currency: 'BRL',
      items: this.presentMonths(totals, monthKeys),
      nextCursor: null,
    });
  }

  private presentMonths(
    totals: readonly MonthlyBucketTotal[],
    monthKeys: readonly string[],
  ): readonly MonthlyTotalsDto[] {
    const byMonth = new Map<string, MonthlyBucketTotal[]>();

    for (const total of totals) {
      byMonth.set(total.monthKey, [...(byMonth.get(total.monthKey) ?? []), total]);
    }

    return monthKeys
      .map((monthKey, monthsAgo) => ({ monthKey, monthsAgo, buckets: byMonth.get(monthKey) }))
      .filter((month) => month.buckets !== undefined)
      .map((month) => ({
        monthKey: month.monthKey,
        monthsAgo: month.monthsAgo,
        isPartial: month.monthsAgo === 0,
        totals: this.magnitudes(month.buckets ?? []),
      }));
  }

  /**
   * A category's figure is the net of everything in it, as a magnitude. Netting
   * is what makes a bookmaker refund reduce the betting total rather than
   * inflate it, and the floor keeps a month that was refunded more than it bet
   * from reading as income.
   */
  private magnitudes(
    buckets: readonly MonthlyBucketTotal[],
  ): Readonly<Record<TransactionCategory, number>> {
    const totals = Object.fromEntries(
      TRANSACTION_CATEGORIES.map((category) => [category, 0]),
    ) as Record<TransactionCategory, number>;

    for (const bucket of buckets) {
      const net = bucket.netAmountInCents;
      totals[bucket.bucket] = Math.max(
        bucket.bucket === INCOMING_CATEGORY ? net : -net,
        0,
      );
    }

    return totals;
  }
}
