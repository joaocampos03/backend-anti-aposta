export interface ClassifyTransactionInput {
  readonly userId: string;
  readonly transactionId: string;
  readonly mcc?: number | null | undefined;
  readonly counterpartyDocument?: string | null | undefined;
  /** The raw statement line. It stops here and goes no further. */
  readonly description?: string | undefined;
}
