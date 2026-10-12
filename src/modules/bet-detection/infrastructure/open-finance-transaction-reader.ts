import type { TransactionAmountLookup } from '@modules/open-finance/index.js';
import type { ClassifiedTransactionReader } from '../application/ports/classified-transaction-reader.port.js';

/** The seam between `bet-detection` and `open-finance`. */
export class OpenFinanceTransactionReader implements ClassifiedTransactionReader {
  constructor(private readonly lookup: TransactionAmountLookup) {}

  async amountInCentsOf(transactionId: string, userId: string): Promise<number | null> {
    return await this.lookup.amountInCentsOf(transactionId, userId);
  }
}
