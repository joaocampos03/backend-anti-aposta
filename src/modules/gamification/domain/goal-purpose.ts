/** What the money is for. The wording and the icon for each are the frontend's. */
export const GOAL_PURPOSES = [
  'EMERGENCY_FUND',
  'DEBT_PAYOFF',
  'HOME',
  'EDUCATION',
  'TRAVEL',
  'VEHICLE',
  'HEALTH',
  'OTHER',
] as const;

export type GoalPurpose = (typeof GOAL_PURPOSES)[number];
