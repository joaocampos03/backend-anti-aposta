import type { BetDay } from '../../domain/bet-day.js';

/**
 * What `gamification` asks `open-finance` for: every São Paulo day since `from`
 * with at least one betting debit, each named by its first bet. It follows the
 * **projected** classification, the same column the statement filters bets by,
 * so a day marked as a bet here is a betting row there — and a correction moves
 * both at once.
 */
export interface BetDayReader {
  betDaysSince(userId: string, from: Date): Promise<readonly BetDay[]>;
}
