export interface ClassifyTransactionInput {
  readonly userId: string;
  readonly transactionId: string;
  readonly mcc?: number | null | undefined;
  readonly counterpartyDocument?: string | null | undefined;
  /** The raw statement line. It stops here and goes no further. */
  readonly description?: string | undefined;
  /**
   * The normalised merchant name the statement shows. Not a policy input: it is
   * what groups a house on the betting screen when the registry has no entry
   * for its registration number.
   */
  readonly counterparty?: string | undefined;
}
