/** The policies, in the chain's order of strength. */
export type DetectionReason = 'GAMBLING_MCC' | 'LICENSED_CNPJ' | 'DESCRIPTION_KEYWORD';

export type DetectionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** Whether the verdict is the chain's or a correction the person made. */
export type ClassificationSource = 'POLICY' | 'USER_OVERRIDE';

const CONFIDENCE_ORDER: readonly DetectionConfidence[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * Why a transaction was taken for a bet, and how sure the chain is.
 *
 * Never a bare boolean, in the domain or on the wire. Somebody who sees a
 * grocery run labelled "Aposta" with no explanation stops trusting the hero
 * figure, the charts, the streak and the goal in one go — so the reason travels
 * with the verdict everywhere.
 */
export class BetClassification {
  private constructor(
    readonly matchedBy: DetectionReason,
    readonly confidence: DetectionConfidence,
    readonly source: ClassificationSource,
  ) {}

  static byPolicy(matchedBy: DetectionReason, confidence: DetectionConfidence): BetClassification {
    return new BetClassification(matchedBy, confidence, 'POLICY');
  }

  static restore(input: {
    readonly matchedBy: DetectionReason;
    readonly confidence: DetectionConfidence;
    readonly source: ClassificationSource;
  }): BetClassification {
    return new BetClassification(input.matchedBy, input.confidence, input.source);
  }

  /** Uncertainty stays visible: a false positive costs more than a false negative. */
  static lowestConfidence(
    confidences: readonly DetectionConfidence[],
  ): DetectionConfidence {
    return confidences.reduce(
      (lowest, candidate) =>
        CONFIDENCE_ORDER.indexOf(candidate) < CONFIDENCE_ORDER.indexOf(lowest) ? candidate : lowest,
      'HIGH',
    );
  }

  equals(other: BetClassification): boolean {
    return (
      this.matchedBy === other.matchedBy &&
      this.confidence === other.confidence &&
      this.source === other.source
    );
  }
}
