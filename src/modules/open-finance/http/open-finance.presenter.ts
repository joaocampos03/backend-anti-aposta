import type { ConnectedAccountsOutput } from '../application/dto/accounts.dto.js';
import type { ListTransactionsOutput } from '../application/dto/ledger.dto.js';
import type { MonthlySummaryOutput } from '../application/dto/monthly-summary.dto.js';
import { encodeLedgerCursor } from './open-finance.schemas.js';

/**
 * Domain-free, and deliberately explicit: every field is spelled out, because
 * four screens are written against this shape and a spread from a DTO that
 * grows would ship a field nobody decided to send.
 */
export class OpenFinancePresenter {
  static ledger(output: ListTransactionsOutput): unknown {
    return {
      syncStatus: output.syncStatus,
      lastSyncedAt: output.lastSyncedAt,
      totals: {
        credits: output.totals.credits,
        debits: output.totals.debits,
        betSpend: output.totals.betSpend,
        betCount: output.totals.betCount,
        betYieldEquivalent: output.totals.betYieldEquivalent,
        annualRatePercent: output.totals.annualRatePercent,
      },
      items: output.items.map((item) => ({
        id: item.id,
        occurredAt: item.occurredAt,
        dayKey: item.dayKey,
        monthKey: item.monthKey,
        counterparty: item.counterparty,
        category: item.category,
        method: item.method,
        status: item.status,
        amount: item.amount,
        accountId: item.accountId,
        bet: item.bet,
        yieldEquivalent: item.yieldEquivalent,
        override: item.override,
      })),
      nextCursor: output.nextCursor === null ? null : encodeLedgerCursor(output.nextCursor),
    };
  }

  static monthlySummary(output: MonthlySummaryOutput): unknown {
    return {
      syncStatus: output.syncStatus,
      currency: output.currency,
      items: output.items.map((item) => ({
        monthKey: item.monthKey,
        monthsAgo: item.monthsAgo,
        isPartial: item.isPartial,
        totals: item.totals,
      })),
      nextCursor: output.nextCursor,
    };
  }

  static accounts(output: ConnectedAccountsOutput): unknown {
    return {
      items: output.items.map((item) => ({
        id: item.id,
        institution: item.institution,
        shortName: item.shortName,
        product: item.product,
        maskedNumber: item.maskedNumber,
        kind: item.kind,
      })),
      nextCursor: output.nextCursor,
    };
  }
}
