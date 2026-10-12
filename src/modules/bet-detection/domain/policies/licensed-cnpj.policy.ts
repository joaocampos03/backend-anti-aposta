import type { DetectionConfidence, DetectionReason } from '../bet-classification.js';
import type { BookmakerRegistry } from '../bookmaker-registry.js';
import type { DetectionSignals } from '../detection-signals.js';
import type { DetectionPolicy } from './detection-policy.js';

/**
 * The counterparty is a betting operator we know by its registration number.
 * Strong, but weaker than the MCC: the registry is ours to keep current, and an
 * operator we have not listed yet is one this policy cannot see.
 */
export class LicensedCnpjPolicy implements DetectionPolicy {
  readonly matchedBy: DetectionReason = 'LICENSED_CNPJ';
  readonly confidence: DetectionConfidence = 'MEDIUM';

  constructor(private readonly registry: BookmakerRegistry) {}

  matches(signals: DetectionSignals): boolean {
    if (signals.counterpartyDocument === null) {
      return false;
    }

    return this.registry.includes(signals.counterpartyDocument);
  }
}
