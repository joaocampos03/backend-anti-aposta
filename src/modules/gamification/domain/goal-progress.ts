const WHOLE = 100;

/**
 * Where a savings goal stands, from the balance and the target alone — so the
 * list, which sums in SQL, and the aggregate, which sums in memory, cannot word
 * the same balance two ways.
 */
export class GoalProgress {
  private constructor(
    readonly savedInCents: number,
    readonly targetInCents: number,
  ) {}

  static of(savedInCents: number, targetInCents: number): GoalProgress {
    return new GoalProgress(savedInCents, targetInCents);
  }

  /** Uncapped: somebody who saved more than they planned deserves to see it. */
  get percent(): number {
    return Math.round((this.savedInCents / this.targetInCents) * WHOLE);
  }

  /** Floored, so no card ever shows a negative "faltam". */
  get remainingInCents(): number {
    return Math.max(0, this.targetInCents - this.savedInCents);
  }

  /** The current state, which a withdrawal can undo — unlike `reachedAt`. */
  get isReached(): boolean {
    return this.savedInCents >= this.targetInCents;
  }
}
