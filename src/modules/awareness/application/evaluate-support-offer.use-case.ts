import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Calendar } from '@shared/domain/calendar.js';
import { ok, type Result } from '@shared/domain/result.js';
import { SupportOffer } from '../domain/support-offer.js';
import type { EvaluateSupportOfferInput, SupportOfferOutput } from './dto/support-offer.dto.js';
import type { MonthlyBetSpendReader } from './ports/monthly-bet-spend-reader.port.js';

/** A year of whole months: enough to report a long run, cheap enough to read every time. */
const MONTHS_CONSIDERED = 12;

/**
 * Decides whether to put support resources in front of somebody.
 *
 * It takes no window and no filter on purpose: whether a person is shown a
 * crisis line cannot depend on which chart option they happen to have selected.
 * The current month is excluded before the rule ever sees it — it is incomplete
 * by definition, and half a month above the floor is not a month above it.
 *
 * @see docs/features/transactions.md
 */
export class EvaluateSupportOffer
  implements UseCase<EvaluateSupportOfferInput, SupportOfferOutput>
{
  constructor(
    private readonly monthlyBetSpend: MonthlyBetSpendReader,
    private readonly calendar: Calendar,
    private readonly clock: Clock,
  ) {}

  async execute(input: EvaluateSupportOfferInput): Promise<Result<SupportOfferOutput, AppError>> {
    const wholeMonthKeys = this.wholeMonthKeys();
    const spendByMonth = await this.monthlyBetSpend.betSpendByMonth(input.userId, wholeMonthKeys);

    const offer = SupportOffer.from(
      wholeMonthKeys.map((monthKey) => ({
        monthKey,
        betSpendInCents: spendByMonth.get(monthKey) ?? 0,
      })),
    );

    return ok({
      shouldOffer: offer.shouldOffer,
      sustainedMonths: offer.sustainedMonths,
      isRising: offer.isRising,
      thresholdInCents: offer.thresholdInCents,
    });
  }

  /** The last twelve months that have actually finished, newest first. */
  private wholeMonthKeys(): readonly string[] {
    const now = this.clock.now();
    const currentMonth = this.calendar.monthKeyOf(now);

    return this.calendar
      .recentMonthKeys(now, MONTHS_CONSIDERED + 1)
      .filter((monthKey) => monthKey !== currentMonth);
  }
}
