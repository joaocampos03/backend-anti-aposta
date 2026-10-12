import type { DetectionConfidence, DetectionReason } from '../bet-classification.js';
import type { DetectionSignals } from '../detection-signals.js';
import type { DetectionPolicy } from './detection-policy.js';

/**
 * The merchant category code for betting and casinos, assigned by the acquirer
 * under an international standard rather than by us. It is the strongest signal
 * in the chain.
 *
 * This is the one place in the backend the number appears, and it never reaches
 * a response: the frontend renders the label "MCC 7995" from the enum.
 */
export const GAMBLING_MCC = 7995;

export class GamblingMccPolicy implements DetectionPolicy {
  readonly matchedBy: DetectionReason = 'GAMBLING_MCC';
  readonly confidence: DetectionConfidence = 'HIGH';

  matches(signals: DetectionSignals): boolean {
    return signals.mcc === GAMBLING_MCC;
  }
}
