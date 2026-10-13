/**
 * Hands a freshly ingested transaction, with the signals only `bet-detection`
 * may keep, to the context that decides whether it is a bet.
 *
 * This is a direct call rather than an event on purpose: the statement line
 * and the counterparty document must not travel through the bus, whose
 * payloads carry ids only. The signals pass through this context's memory on
 * their way and are never stored here.
 */
export interface TransactionClassifier {
  classify(input: {
    readonly userId: string;
    readonly transactionId: string;
    readonly merchantCategoryCode: number | null;
    readonly counterpartyDocument: string | null;
    readonly statementLine: string;
  }): Promise<void>;
}
