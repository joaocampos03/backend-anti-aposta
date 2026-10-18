import type { ReachedGoalsReader } from '../../application/ports/reached-goals-reader.port.js';
import type { ReachedGoals } from '../../domain/badge-attainment.js';

/** Reached goals as a test arranges them, newest first. */
export class InMemoryReachedGoalsReader implements ReachedGoalsReader {
  constructor(public titles: readonly string[] = []) {}

  async reachedGoalsOf(_userId: string, titleLimit: number): Promise<ReachedGoals> {
    return { count: this.titles.length, titles: this.titles.slice(0, titleLimit) };
  }
}
