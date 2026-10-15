/**
 * The public API of `awareness`. It owns the rate and the compound-interest
 * service: an unlabelled projection is a made-up number, so the rate travels
 * with every figure it produced. It also owns the equivalence catalogue, so the
 * quantities an amount is divided into are computed in one place.
 */
export { AmountReframing } from './application/amount-reframing.js';
export type { ReframedAmount } from './application/amount-reframing.js';
export { DescribeEquivalences } from './application/describe-equivalences.js';
export type {
  EquivalencesOutput,
  OwnSpendingEquivalenceDto,
  ReferenceItemEquivalenceDto,
} from './application/dto/equivalences.dto.js';
export { EvaluateSupportOffer } from './application/evaluate-support-offer.use-case.js';
export type { CategoryAverageReader } from './application/ports/category-average-reader.port.js';
export type { MonthlyBetSpendReader } from './application/ports/monthly-bet-spend-reader.port.js';
export type { SupportOfferOutput } from './application/dto/support-offer.dto.js';
export { OWN_SPENDING_CATEGORIES } from './domain/spending-equivalence.js';
export type { OwnSpendingCategory } from './domain/spending-equivalence.js';
export { FIXED_INCOME_ANNUAL_RATE_PERCENT } from './domain/yield-equivalent.js';
