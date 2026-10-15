import type { ClassifyTransaction } from '@modules/bet-detection/index.js';
import type { TransactionClassifier } from '../application/ports/transaction-classifier.port.js';

/**
 * The seam between ingestion and detection: `open-finance`'s port on one side,
 * `bet-detection`'s published use case on the other. The statement line crosses
 * here, by direct call, and nowhere else.
 */
export class BetDetectionTransactionClassifier implements TransactionClassifier {
  constructor(private readonly classifyTransaction: ClassifyTransaction) {}

  async classify(input: {
    readonly userId: string;
    readonly transactionId: string;
    readonly merchantCategoryCode: number | null;
    readonly counterpartyDocument: string | null;
    readonly statementLine: string;
    readonly counterparty: string;
  }): Promise<void> {
    const classified = await this.classifyTransaction.execute({
      userId: input.userId,
      transactionId: input.transactionId,
      mcc: input.merchantCategoryCode,
      counterpartyDocument: input.counterpartyDocument,
      description: input.statementLine,
      counterparty: input.counterparty,
    });

    if (!classified.ok) {
      throw new Error(`classification refused: ${classified.error.code}`);
    }
  }
}
