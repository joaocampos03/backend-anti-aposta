/**
 * The public API of `awareness`. It owns the rate and the compound-interest
 * service: an unlabelled projection is a made-up number, so the rate travels
 * with every figure it produced.
 */
export { AmountReframing } from './application/amount-reframing.js';
export type { ReframedAmount } from './application/amount-reframing.js';
export { EvaluateSupportOffer } from './application/evaluate-support-offer.use-case.js';
export type { MonthlyBetSpendReader } from './application/ports/monthly-bet-spend-reader.port.js';
export type { SupportOfferOutput } from './application/dto/support-offer.dto.js';
export { FIXED_INCOME_ANNUAL_RATE_PERCENT } from './domain/yield-equivalent.js';
