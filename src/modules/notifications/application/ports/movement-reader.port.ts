/** A statement row as the list quotes it. The bet fields are `open-finance`'s enums, passed through. */
export interface MovementLine {
  readonly transactionId: string;
  readonly occurredAt: string;
  readonly counterparty: string;
  readonly amountInCents: number;
  readonly bet: {
    readonly matchedBy: string;
    readonly confidence: string;
  } | null;
}

/**
 * Reads the statement rather than keeping a copy of it: a correction shows at
 * once, and a revoked consent leaves nothing financial in the inbox. Ids that no
 * longer resolve, or are not this person's, are simply absent from the answer.
 */
export interface MovementReader {
  newestOf(
    userId: string,
    transactionIds: readonly string[],
    limit: number,
  ): Promise<readonly MovementLine[]>;
}
