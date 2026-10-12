import type { ClassifiedTransactionReader } from '../../application/ports/classified-transaction-reader.port.js';

export class InMemoryClassifiedTransactionReader implements ClassifiedTransactionReader {
  readonly amounts = new Map<string, number>();

  record(transactionId: string, userId: string, amountInCents: number): void {
    this.amounts.set(`${userId}:${transactionId}`, amountInCents);
  }

  async amountInCentsOf(transactionId: string, userId: string): Promise<number | null> {
    return this.amounts.get(`${userId}:${transactionId}`) ?? null;
  }
}
