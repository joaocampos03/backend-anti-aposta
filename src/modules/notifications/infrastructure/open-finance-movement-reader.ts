import type { PrismaMovementLineQuery } from '@modules/open-finance/index.js';
import type { MovementLine, MovementReader } from '../application/ports/movement-reader.port.js';

/** The seam between `notifications` and `open-finance`. */
export class OpenFinanceMovementReader implements MovementReader {
  constructor(private readonly lines: PrismaMovementLineQuery) {}

  async newestOf(
    userId: string,
    transactionIds: readonly string[],
    limit: number,
  ): Promise<readonly MovementLine[]> {
    return this.lines.newestOf(userId, transactionIds, limit);
  }
}
