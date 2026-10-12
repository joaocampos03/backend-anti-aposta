import { BetClassification, type DetectionConfidence } from './bet-classification.js';
import type { BookmakerRegistry } from './bookmaker-registry.js';
import type { DetectionSignals } from './detection-signals.js';
import { DescriptionKeywordPolicy } from './policies/description-keyword.policy.js';
import type { DetectionPolicy } from './policies/detection-policy.js';
import { GamblingMccPolicy } from './policies/gambling-mcc.policy.js';
import { LicensedCnpjPolicy } from './policies/licensed-cnpj.policy.js';

/**
 * The ordered chain. It answers **why** a transaction was taken for a bet and
 * how sure it is, never a boolean.
 *
 * Two rules decide the verdict when more than one policy agrees:
 *
 *   - `matchedBy` is the **strongest** policy that matched, because that is the
 *     reason worth explaining to the reader.
 *   - `confidence` is the **lowest** of all that matched, because uncertainty
 *     has to survive the journey to the screen. A false positive here is worse
 *     than a false negative: it labels somebody's grocery run a bet.
 */
export class DetectionPolicyChain {
  private constructor(private readonly policies: readonly DetectionPolicy[]) {}

  /** Strongest first. The order is the contract. */
  static standard(registry: BookmakerRegistry): DetectionPolicyChain {
    return new DetectionPolicyChain([
      new GamblingMccPolicy(),
      new LicensedCnpjPolicy(registry),
      new DescriptionKeywordPolicy(),
    ]);
  }

  static of(policies: readonly DetectionPolicy[]): DetectionPolicyChain {
    return new DetectionPolicyChain(policies);
  }

  classify(signals: DetectionSignals): BetClassification | null {
    const agreed = this.policies.filter((policy) => policy.matches(signals));
    const strongest = agreed[0];

    if (strongest === undefined) {
      return null;
    }

    const confidences: readonly DetectionConfidence[] = agreed.map((policy) => policy.confidence);

    return BetClassification.byPolicy(
      strongest.matchedBy,
      BetClassification.lowestConfidence(confidences),
    );
  }
}
