import type { BetDayReader } from '../../application/ports/bet-day-reader.port.js';
import type { BetDay } from '../../domain/bet-day.js';

/** The bet days as a test arranges them: one list for every caller. */
export class InMemoryBetDayReader implements BetDayReader {
  constructor(public days: readonly BetDay[] = []) {}

  async betDaysSince(): Promise<readonly BetDay[]> {
    return this.days;
  }
}
