/**
 * The one thing `bet-detection` asks `open-finance` for: how much the
 * transaction was, so a restored classification can be reframed without the
 * caller fetching the row again. Answered through that context's public API.
 */
export interface ClassifiedTransactionReader {
  amountInCentsOf(transactionId: string, userId: string): Promise<number | null>;
}
