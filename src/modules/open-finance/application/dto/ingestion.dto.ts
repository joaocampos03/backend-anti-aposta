import type {
  PaymentMethod,
  TransactionCategory,
  TransactionStatus,
} from '../../domain/transaction-attributes.js';

/**
 * One movement as the institution shared it, already translated by the
 * anti-corruption layer into this context's own words.
 */
export interface IngestedTransaction {
  readonly accountId: string;
  /** The institution's id for the movement, unique per account. */
  readonly externalId: string;
  readonly occurredAt: Date;
  readonly amountInCents: number;
  readonly counterparty: string;
  readonly category: TransactionCategory;
  readonly method: PaymentMethod;
  readonly status: TransactionStatus;
}

export interface IngestTransactionsInput {
  readonly userId: string;
  readonly transactions: readonly IngestedTransaction[];
}

export interface IngestTransactionsOutput {
  readonly transactionIds: readonly string[];
}
