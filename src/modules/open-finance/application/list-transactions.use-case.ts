import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import type { Calendar } from '@shared/domain/calendar.js';
import { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { ConnectedAccountRepository } from '../domain/connected-account.repository.js';
import type {
  LedgerPeriod,
  ListTransactionsInput,
  ListTransactionsOutput,
  TransactionDto,
} from './dto/ledger.dto.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type {
  LedgerFilter,
  LedgerRow,
  LedgerTotalsRow,
  TransactionLedgerQuery,
} from './ports/transaction-ledger.query.port.js';
import type { YieldCalculator } from './ports/yield-calculator.port.js';

/** `LAST_30_DAYS` is today plus the 29 days before it, matching `daysAgo < 30`. */
const PERIOD_IN_DAYS: Readonly<Record<Exclude<LedgerPeriod, 'ALL_TIME'>, number>> = {
  LAST_30_DAYS: 29,
  LAST_90_DAYS: 89,
  LAST_180_DAYS: 179,
  LAST_360_DAYS: 359,
};

const EMPTY_TOTALS: LedgerTotalsRow = {
  creditsInCents: 0,
  debitsInCents: 0,
  netBetSpendInCents: 0,
  betCount: 0,
};

export interface ListTransactionsDependencies {
  readonly consents: ConsentRepository;
  readonly accounts: ConnectedAccountRepository;
  readonly ledger: TransactionLedgerQuery;
  readonly yields: YieldCalculator;
  readonly calendar: Calendar;
  readonly clock: Clock;
}

/**
 * The statement: one filtered page of rows, plus the totals for everything that
 * matched.
 *
 * An empty list is three different screens, so the state is explicit. A user
 * who has never connected an account gets `NO_CONSENT` and no figures at all —
 * a zero there would read as "you spent nothing on bets", which is a claim the
 * data does not support.
 *
 * @see docs/features/transactions.md
 */
export class ListTransactions implements UseCase<ListTransactionsInput, ListTransactionsOutput> {
  constructor(private readonly dependencies: ListTransactionsDependencies) {}

  async execute(input: ListTransactionsInput): Promise<Result<ListTransactionsOutput, AppError>> {
    const now = this.dependencies.clock.now();
    const consent = await this.dependencies.consents.findLatestByUserId(
      UniqueEntityId.restore(input.userId),
    );
    const syncStatus = consent === null ? 'NO_CONSENT' : consent.syncStatusAt(now);

    const ownedAccount = await this.verifyAccount(input, consent);

    if (!ownedAccount.ok) {
      return ownedAccount;
    }

    const knownBookmaker = await this.verifyBookmaker(input);

    if (!knownBookmaker.ok) {
      return knownBookmaker;
    }

    if (syncStatus === 'NO_CONSENT') {
      return ok(this.nothingToShow(syncStatus, null));
    }

    return ok(await this.describe(input, syncStatus, consent?.lastSyncedAt ?? null, now));
  }

  /** A filter naming somebody else's account answers 404, never 403. */
  private async verifyAccount(
    input: ListTransactionsInput,
    consent: Consent | null,
  ): Promise<Result<void, AppError>> {
    if (input.accountId === null) {
      return ok(undefined);
    }

    const account =
      consent === null
        ? null
        : await this.dependencies.accounts.findByIdAndUserId(
            UniqueEntityId.restore(input.accountId),
            UniqueEntityId.restore(input.userId),
          );

    return account === null ? fail(openFinanceFailures.accountNotFound()) : ok(undefined);
  }

  /**
   * A bookmaker id absent from this reader's own history answers 404, exactly
   * as a malformed one does. Confirming that somebody else's house exists would
   * be the same leak as confirming their account.
   */
  private async verifyBookmaker(input: ListTransactionsInput): Promise<Result<void, AppError>> {
    if (input.bookmakerId === null) {
      return ok(undefined);
    }

    const known = await this.dependencies.ledger.containsBookmaker(
      input.userId,
      input.bookmakerId,
    );

    return known ? ok(undefined) : fail(openFinanceFailures.bookmakerNotFound());
  }

  private async describe(
    input: ListTransactionsInput,
    syncStatus: 'SYNCING' | 'READY',
    lastSyncedAt: Date | null,
    now: Date,
  ): Promise<ListTransactionsOutput> {
    const filter = this.filterFrom(input, now);
    const [page, totals] = await Promise.all([
      this.dependencies.ledger.page(filter, input.limit, this.cursorFrom(input)),
      this.dependencies.ledger.totals(filter),
    ]);

    return {
      syncStatus,
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      totals: this.presentTotals(totals),
      items: page.rows.map((row) => this.presentRow(row)),
      nextCursor:
        page.nextCursor === null
          ? null
          : {
              occurredAt: page.nextCursor.occurredAt.toISOString(),
              id: page.nextCursor.id,
            },
    };
  }

  private nothingToShow(
    syncStatus: 'NO_CONSENT',
    lastSyncedAt: string | null,
  ): ListTransactionsOutput {
    return {
      syncStatus,
      lastSyncedAt,
      totals: this.presentTotals(EMPTY_TOTALS),
      items: [],
      nextCursor: null,
    };
  }

  private filterFrom(input: ListTransactionsInput, now: Date): LedgerFilter {
    return {
      userId: input.userId,
      type: input.type,
      occurredFrom: this.periodStart(input.period, now),
      accountId: input.accountId,
      bookmakerId: input.bookmakerId,
      search: input.search,
    };
  }

  private periodStart(period: LedgerPeriod, now: Date): Date | null {
    if (period === 'ALL_TIME') {
      return null;
    }

    return this.dependencies.calendar.startOfDaysBefore(now, PERIOD_IN_DAYS[period]);
  }

  private cursorFrom(input: ListTransactionsInput) {
    if (input.cursor === null) {
      return null;
    }

    return { occurredAt: new Date(input.cursor.occurredAt), id: input.cursor.id };
  }

  private presentTotals(totals: LedgerTotalsRow) {
    const betSpend = Money.restore(totals.netBetSpendInCents).atLeastZero();
    const reframed = this.dependencies.yields.reframe(betSpend.amountInCents);

    return {
      credits: { amountInCents: totals.creditsInCents, currency: 'BRL' as const },
      debits: { amountInCents: totals.debitsInCents, currency: 'BRL' as const },
      betSpend: { amountInCents: betSpend.amountInCents, currency: 'BRL' as const },
      betCount: totals.betCount,
      betYieldEquivalent: {
        amountInCents: reframed.futureValueInCents,
        currency: 'BRL' as const,
      },
      annualRatePercent: reframed.annualRatePercent,
    };
  }

  private presentRow(row: LedgerRow): TransactionDto {
    const bet =
      row.betMatchedBy === null || row.betConfidence === null || row.betSource === null
        ? null
        : {
            matchedBy: row.betMatchedBy,
            confidence: row.betConfidence,
            source: row.betSource,
          };

    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      dayKey: this.dependencies.calendar.dayKeyOf(row.occurredAt),
      monthKey: this.dependencies.calendar.monthKeyOf(row.occurredAt),
      counterparty: row.counterparty,
      category: row.category,
      method: row.method,
      status: row.status,
      amount: { amountInCents: row.amountInCents, currency: 'BRL' },
      accountId: row.accountId,
      bet,
      yieldEquivalent:
        bet === null
          ? null
          : {
              amountInCents: this.dependencies.yields.reframe(row.amountInCents)
                .futureValueInCents,
              currency: 'BRL',
            },
      override:
        row.overriddenAt === null
          ? null
          : {
              verdict: 'NOT_A_BET',
              overriddenAt: row.overriddenAt.toISOString(),
              isReversible: true,
            },
    };
  }
}
