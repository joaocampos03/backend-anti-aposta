import type { DayKey } from '@shared/domain/calendar.js';

/** How the classification caught a bet, as `bet-detection` reports it. */
export type BetMatch = 'GAMBLING_MCC' | 'LICENSED_CNPJ' | 'DESCRIPTION_KEYWORD';

/**
 * A São Paulo day with at least one betting debit, named by its **first** bet —
 * the one that actually ended the stretch running into that day. The
 * counterparty and the policy travel so every break on the screen stays
 * auditable: the classification is the platform's claim, and a claim the person
 * cannot check is one they have to take on faith.
 */
export interface BetDay {
  readonly dayKey: DayKey;
  readonly counterparty: string;
  readonly matchedBy: BetMatch;
}
