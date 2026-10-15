import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type {
  ClassificationSource,
  DetectionConfidence,
  DetectionReason,
} from '../domain/bet-classification.js';
import type { TransactionClassificationRepository } from '../domain/transaction-classification.repository.js';

export interface ProjectedClassification {
  readonly bet: {
    readonly matchedBy: DetectionReason;
    readonly confidence: DetectionConfidence;
    readonly source: ClassificationSource;
    /** Opaque, and never the registration number behind it. */
    readonly bookmakerId: string | null;
  } | null;
  readonly overriddenAt: Date | null;
}

/**
 * What `bet-detection` publishes so `open-finance` can keep its projection
 * current. A read, never a write: the verdict stays this context's to decide.
 */
export class ClassificationLookup {
  constructor(private readonly classifications: TransactionClassificationRepository) {}

  async effectiveFor(
    transactionId: string,
    userId: string,
  ): Promise<ProjectedClassification | null> {
    const classification = await this.classifications.findByTransactionIdAndUserId(
      UniqueEntityId.restore(transactionId),
      UniqueEntityId.restore(userId),
    );

    if (classification === null) {
      return null;
    }

    const effective = classification.effectiveClassification;

    return {
      bet:
        effective === null
          ? null
          : {
              matchedBy: effective.matchedBy,
              confidence: effective.confidence,
              source: effective.source,
              bookmakerId: classification.effectiveBookmaker?.bookmakerId.value ?? null,
            },
      overriddenAt: classification.override?.overriddenAt ?? null,
    };
  }
}
