import type { ReachedGoals } from '../../domain/badge-attainment.js';

/**
 * The savings goals this person ever reached — `reachedAt` set, which is never
 * cleared — counted in SQL rather than by hydrating every ledger. Newest reached
 * first, with at most `titleLimit` titles.
 */
export interface ReachedGoalsReader {
  reachedGoalsOf(userId: string, titleLimit: number): Promise<ReachedGoals>;
}
