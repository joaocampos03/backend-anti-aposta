import type { MovementLine, MovementReader } from '../../application/ports/movement-reader.port.js';

interface OwnedLine {
  readonly userId: string;
  readonly line: MovementLine;
}

export class InMemoryMovementReader implements MovementReader {
  lines: OwnedLine[] = [];

  async newestOf(
    userId: string,
    transactionIds: readonly string[],
    limit: number,
  ): Promise<readonly MovementLine[]> {
    return this.lines
      .filter((owned) => owned.userId === userId)
      .map((owned) => owned.line)
      .filter((line) => transactionIds.includes(line.transactionId))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit);
  }
}
