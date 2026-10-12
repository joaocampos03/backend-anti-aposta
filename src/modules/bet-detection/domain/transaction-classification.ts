import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BetClassification } from './bet-classification.js';
import { BetDetectionError } from './bet-detection.errors.js';
import type { DetectionPolicyChain } from './detection-policy-chain.js';
import type { DetectionSignals } from './detection-signals.js';
import { BetClassificationOverridden } from './events/bet-classification-overridden.js';
import { BetTransactionDetected } from './events/bet-transaction-detected.js';

const REASON_MAXIMUM_LENGTH = 280;

/** What the person said, kept for the paper's precision measurement and shown to nobody. */
export interface ClassificationOverride {
  readonly verdict: 'NOT_A_BET';
  readonly reason: string | null;
  readonly overriddenAt: Date;
}

interface TransactionClassificationProperties {
  readonly userId: UniqueEntityId;
  readonly signals: DetectionSignals;
  readonly policyVerdict: BetClassification | null;
  readonly override: ClassificationOverride | null;
  readonly classifiedAt: Date;
}

/**
 * Everything this context knows about one transaction: what the bank sent that
 * the policies may look at, what the chain decided, and whether the person has
 * corrected it.
 *
 * Its id **is** the transaction's id. The relationship is one to one and saying
 * so in the model removes a whole class of question about which record is the
 * current one.
 *
 * @see docs/features/transactions.md
 */
export class TransactionClassification extends AggregateRoot {
  private properties: TransactionClassificationProperties;

  private constructor(
    transactionId: UniqueEntityId,
    properties: TransactionClassificationProperties,
  ) {
    super(transactionId);
    this.properties = properties;
  }

  /** Runs the chain for a transaction this context has not seen before. */
  static classify(input: {
    readonly transactionId: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly signals: DetectionSignals;
    readonly chain: DetectionPolicyChain;
    readonly classifiedAt: Date;
  }): TransactionClassification {
    const verdict = input.chain.classify(input.signals);
    const classification = new TransactionClassification(input.transactionId, {
      userId: input.userId,
      signals: input.signals,
      policyVerdict: verdict,
      override: null,
      classifiedAt: input.classifiedAt,
    });

    classification.announceIfBet(verdict, input.classifiedAt);

    return classification;
  }

  static restore(
    transactionId: UniqueEntityId,
    properties: TransactionClassificationProperties,
  ): TransactionClassification {
    return new TransactionClassification(transactionId, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get signals(): DetectionSignals {
    return this.properties.signals;
  }

  get policyVerdict(): BetClassification | null {
    return this.properties.policyVerdict;
  }

  get override(): ClassificationOverride | null {
    return this.properties.override;
  }

  get classifiedAt(): Date {
    return this.properties.classifiedAt;
  }

  /**
   * What the rest of the product sees. A correction outranks the chain
   * permanently, which is the whole point of having one.
   */
  get effectiveClassification(): BetClassification | null {
    if (this.properties.override !== null) {
      return null;
    }

    return this.properties.policyVerdict;
  }

  get isBet(): boolean {
    return this.effectiveClassification !== null;
  }

  /**
   * Records "isto não é uma aposta". Refused when there is nothing to correct,
   * because a correction to a transaction the product never called a bet would
   * be a no-op the person believes did something.
   */
  overrideAsNotABet(input: {
    readonly reason: string | null;
    readonly overriddenAt: Date;
  }): Result<void, BetDetectionError<'NOT_CLASSIFIED_AS_BET' | 'ALREADY_OVERRIDDEN'>> {
    if (this.properties.override !== null) {
      return fail(BetDetectionError.alreadyOverridden());
    }

    if (this.properties.policyVerdict === null) {
      return fail(BetDetectionError.notClassifiedAsBet());
    }

    this.properties = {
      ...this.properties,
      override: {
        verdict: 'NOT_A_BET',
        reason: input.reason === null ? null : input.reason.slice(0, REASON_MAXIMUM_LENGTH),
        overriddenAt: input.overriddenAt,
      },
    };

    this.addEvent(
      new BetClassificationOverridden({
        userId: this.properties.userId,
        transactionId: this.id,
        verdict: 'NOT_A_BET',
        overriddenAt: input.overriddenAt,
      }),
    );

    return ok(undefined);
  }

  /**
   * Undoes the correction by **re-reading** the chain rather than restoring the
   * verdict it remembered: if the bookmaker registry has changed since, the
   * current verdict is the one that applies.
   */
  revertOverride(input: {
    readonly chain: DetectionPolicyChain;
    readonly revertedAt: Date;
  }): Result<void, BetDetectionError<'OVERRIDE_NOT_FOUND'>> {
    if (this.properties.override === null) {
      return fail(BetDetectionError.overrideNotFound());
    }

    const verdict = input.chain.classify(this.properties.signals);

    this.properties = {
      ...this.properties,
      override: null,
      policyVerdict: verdict,
      classifiedAt: input.revertedAt,
    };

    this.addEvent(
      new BetClassificationOverridden({
        userId: this.properties.userId,
        transactionId: this.id,
        verdict: 'REVERTED',
        overriddenAt: input.revertedAt,
      }),
    );

    return ok(undefined);
  }

  /**
   * Re-runs the chain, as a re-ingestion of the same transaction would. A
   * correction survives it: the override outranks the policy permanently.
   */
  reclassify(chain: DetectionPolicyChain, at: Date): void {
    const verdict = chain.classify(this.properties.signals);
    const wasBet = this.properties.policyVerdict !== null;

    this.properties = { ...this.properties, policyVerdict: verdict, classifiedAt: at };

    if (!wasBet) {
      this.announceIfBet(verdict, at);
    }
  }

  private announceIfBet(verdict: BetClassification | null, at: Date): void {
    if (verdict === null) {
      return;
    }

    this.addEvent(
      new BetTransactionDetected({
        userId: this.properties.userId,
        transactionId: this.id,
        matchedBy: verdict.matchedBy,
        confidence: verdict.confidence,
        detectedAt: at,
      }),
    );
  }
}
