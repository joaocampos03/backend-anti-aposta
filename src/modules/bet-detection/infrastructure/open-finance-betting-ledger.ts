import type { PrismaBettingWindowQuery, SyncStatusLookup } from '@modules/open-finance/index.js';
import type {
  BettingLedgerReader,
  BettingSyncStatus,
  LedgerBetEntry,
} from '../application/ports/betting-ledger-reader.port.js';

/**
 * The seam between `bet-detection` and `open-finance` for the betting screen.
 *
 * Everything it reads is already that context's own answer about its own rows,
 * including the verdict this context projected there — so the screen's figures
 * and the statement's are the same figures rather than two computations that
 * usually agree.
 */
export class OpenFinanceBettingLedger implements BettingLedgerReader {
  constructor(
    private readonly window: PrismaBettingWindowQuery,
    private readonly syncStatus: SyncStatusLookup,
  ) {}

  async syncStatusOf(userId: string): Promise<BettingSyncStatus> {
    return await this.syncStatus.statusOf(userId);
  }

  async entriesSince(userId: string, from: Date): Promise<readonly LedgerBetEntry[]> {
    const entries = await this.window.entriesSince(userId, from);

    return entries.map((entry) => ({
      occurredAt: entry.occurredAt,
      amountInCents: entry.amountInCents,
      bookmakerId: entry.bookmakerId,
      matchedBy: entry.matchedBy,
      confidence: entry.confidence,
    }));
  }

  async incomeInCentsSince(userId: string, from: Date): Promise<number> {
    return await this.window.incomeInCentsSince(userId, from);
  }
}
