import type { DetectionConfidence, DetectionReason } from '../bet-classification.js';
import type { DetectionSignals } from '../detection-signals.js';

/**
 * One rule in the chain. A policy answers whether it recognises a bet and
 * nothing else; it never decides the final verdict, because a transaction can
 * match several and the chain is what reconciles them.
 */
export interface DetectionPolicy {
  readonly matchedBy: DetectionReason;
  readonly confidence: DetectionConfidence;
  matches(signals: DetectionSignals): boolean;
}
