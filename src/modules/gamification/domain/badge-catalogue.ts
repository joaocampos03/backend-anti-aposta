/** What a badge is counted in. One family, one figure, so no two badges can disagree. */
export type BadgeFamily = 'STREAK' | 'CEILING' | 'REDUCTION' | 'SAVINGS';

export type BadgeId =
  | 'streak-7'
  | 'streak-15'
  | 'streak-30'
  | 'streak-90'
  | 'ceiling-1'
  | 'ceiling-3'
  | 'ceiling-6'
  | 'reduction-1'
  | 'reduction-3'
  | 'savings-1'
  | 'savings-3';

export interface BadgeDefinition {
  readonly id: BadgeId;
  readonly family: BadgeFamily;
  /** The figure the family is measured in that this badge needs. Always at least one. */
  readonly threshold: number;
}

/**
 * Every milestone the product recognises, in the order the screen renders them:
 * by family, then by threshold. Nothing here rewards participation — opening the
 * app, connecting an account or setting a goal earns nothing — and every
 * criterion is published before it is met, so nothing is ever revealed.
 *
 * The thresholds are reachable from where this audience starts: three bet-free
 * days is too small a thing to call an achievement, a year too far away to be
 * anything but discouraging.
 */
export const BADGE_CATALOGUE: readonly BadgeDefinition[] = [
  { id: 'streak-7', family: 'STREAK', threshold: 7 },
  { id: 'streak-15', family: 'STREAK', threshold: 15 },
  { id: 'streak-30', family: 'STREAK', threshold: 30 },
  { id: 'streak-90', family: 'STREAK', threshold: 90 },
  { id: 'ceiling-1', family: 'CEILING', threshold: 1 },
  { id: 'ceiling-3', family: 'CEILING', threshold: 3 },
  { id: 'ceiling-6', family: 'CEILING', threshold: 6 },
  { id: 'reduction-1', family: 'REDUCTION', threshold: 1 },
  { id: 'reduction-3', family: 'REDUCTION', threshold: 3 },
  { id: 'savings-1', family: 'SAVINGS', threshold: 1 },
  { id: 'savings-3', family: 'SAVINGS', threshold: 3 },
];

/**
 * The families measured in the statement shared through Open Finance. Revoking
 * that consent forgets their badges, because they are data derived from it;
 * savings badges come from what the person recorded here and stay.
 */
export const MEASURED_FAMILIES: readonly BadgeFamily[] = ['STREAK', 'CEILING', 'REDUCTION'];

export function findBadgeDefinition(id: string): BadgeDefinition | null {
  return BADGE_CATALOGUE.find((definition) => definition.id === id) ?? null;
}

export function isMeasuredFamily(family: BadgeFamily): boolean {
  return MEASURED_FAMILIES.includes(family);
}
