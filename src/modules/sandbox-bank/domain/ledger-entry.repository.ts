import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { LedgerEntry } from './ledger-entry.js';

export interface StatementWindow {
  readonly from: Date;
  readonly to: Date;
}

export interface StatementPage {
  readonly entries: readonly LedgerEntry[];
  readonly totalRecords: number;
}

export interface LedgerEntryRepository {
  save(entry: LedgerEntry): Promise<void>;
  /**
   * One page of an account's statement inside a booking window, newest first.
   * `page` counts from one, as the specification's query parameter does.
   */
  findPageByAccountId(
    accountId: UniqueEntityId,
    window: StatementWindow,
    page: { readonly number: number; readonly size: number },
  ): Promise<StatementPage>;
}
