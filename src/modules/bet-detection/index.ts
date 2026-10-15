/**
 * The public API of `bet-detection`. `GAMBLING_MCC` is deliberately not here:
 * the number is declared once, inside this context, and reaches the frontend
 * only as a label. Neither is `Cnpj`: the registration number is the registry's
 * key and it never crosses this boundary.
 */
export { ClassificationLookup } from './application/classification-lookup.js';
export type { ProjectedClassification } from './application/classification-lookup.js';
export { ClassifyTransaction } from './application/classify-transaction.use-case.js';
export { ForgetUserClassifications } from './application/forget-user-classifications.use-case.js';
export { ReclassifyTransaction } from './application/reclassify-transaction.use-case.js';
export { RevertReclassification } from './application/revert-reclassification.use-case.js';
export { SummariseBetting } from './application/summarise-betting.use-case.js';
export type {
  BettingSummaryOutput,
  BetWindowInDays,
} from './application/dto/betting-summary.dto.js';
export { BetClassificationOverridden } from './domain/events/bet-classification-overridden.js';
export type { BetClassificationOverriddenPayload } from './domain/events/bet-classification-overridden.js';
export { BetTransactionDetected } from './domain/events/bet-transaction-detected.js';
export type { BetTransactionDetectedPayload } from './domain/events/bet-transaction-detected.js';
