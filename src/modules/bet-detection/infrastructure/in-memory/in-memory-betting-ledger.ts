import type {
  BettingLedgerReader,
  BettingSyncStatus,
  LedgerBetEntry,
} from '../../application/ports/betting-ledger-reader.port.js';

export class InMemoryBettingLedger implements BettingLedgerReader {
  private status: BettingSyncStatus = 'READY';
  private entries: readonly LedgerBetEntry[] = [];
  private incomeInCents = 0;

  /** Arrange: the statement this reader's betting screen is computed from. */
  hold(input: {
    readonly syncStatus?: BettingSyncStatus;
    readonly entries?: readonly LedgerBetEntry[];
    readonly incomeInCents?: number;
  }): void {
    this.status = input.syncStatus ?? this.status;
    this.entries = input.entries ?? this.entries;
    this.incomeInCents = input.incomeInCents ?? this.incomeInCents;
  }

  async syncStatusOf(_userId: string): Promise<BettingSyncStatus> {
    return this.status;
  }

  async entriesSince(_userId: string, from: Date): Promise<readonly LedgerBetEntry[]> {
    return this.entries.filter((entry) => entry.occurredAt.getTime() >= from.getTime());
  }

  async incomeInCentsSince(_userId: string, _from: Date): Promise<number> {
    return this.incomeInCents;
  }
}
