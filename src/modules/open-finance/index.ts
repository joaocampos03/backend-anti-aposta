/**
 * The public API of `open-finance`. Other contexts import this file and nothing
 * else from here.
 *
 * Note what is **not** exported: the raw statement line. This context does not
 * hold one — it lives in `bet-detection`, which is the only context allowed to
 * read it.
 */
export type { AuthorisedConsentPresence } from './application/authorised-consent-presence.js';
export { AuthorisedConsentQuery } from './infrastructure/authorised-consent.query.js';
export { IngestTransactions } from './application/ingest-transactions.use-case.js';
export type {
  IngestedTransaction,
  IngestTransactionsInput,
} from './application/dto/ingestion.dto.js';
export { ListConnectedAccounts } from './application/list-connected-accounts.use-case.js';
export { ListTransactions } from './application/list-transactions.use-case.js';
export { ProjectClassification } from './application/project-classification.use-case.js';
export { PurgeUserFinancialData } from './application/purge-user-financial-data.use-case.js';
export { SummariseSpendByMonth } from './application/summarise-spend-by-month.use-case.js';
export { SyncStatusLookup } from './application/sync-status-lookup.js';
export { TransactionAmountLookup } from './application/transaction-amount-lookup.js';
export type { SyncStatus } from './domain/consent.js';
export { PrismaBettingWindowQuery } from './infrastructure/betting-window.query.js';
export type { BetWindowEntry } from './infrastructure/betting-window.query.js';
export { PrismaCategorySpendQuery } from './infrastructure/category-spend.query.js';
export type { CategorySpendOverMonths } from './infrastructure/category-spend.query.js';
export { PrismaMonthlyBetSpendQuery } from './infrastructure/monthly-bet-spend.query.js';
export { ConsentRevoked } from './domain/events/consent-revoked.js';
export type { ConsentRevokedPayload } from './domain/events/consent-revoked.js';
export { TransactionsIngested } from './domain/events/transactions-ingested.js';
export type { TransactionsIngestedPayload } from './domain/events/transactions-ingested.js';
