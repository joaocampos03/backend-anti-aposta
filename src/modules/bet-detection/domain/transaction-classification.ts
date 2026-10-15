import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BetClassification } from './bet-classification.js';
import { BetDetectionError } from './bet-detection.errors.js';
import { BookmakerIdentity } from './bookmaker-identity.js';
import type { BookmakerRegistry } from './bookmaker-registry.js';
import type { DetectionPolicyChain } from './detection-policy-chain.js';
import type { DetectionSignals } from './detection-signals.js';
import { BetClassificationOverridden } from './events/bet-classification-overridden.js';
import { BetTransactionDetected } from './events/bet-transaction-detected.js';

const REASON_MAXIMUM_LENGTH = 280;

/** A transaction nobody called a bet belongs to no bookmaker. */
function attributionFor(
  verdict: BetClassification | null,
  counterparty: string,
  signals: DetectionSignals,
  detection: DetectionContext,
): BookmakerIdentity | null {
  if (verdict === null) {
    return null;
  }

  return BookmakerIdentity.resolve({
    counterparty,
    counterpartyDocument: signals.counterpartyDocument,
    registry: detection.registry,
  });
}

/** What the person said, kept for the paper's precision measurement and shown to nobody. */
export interface ClassificationOverride {
  readonly verdict: 'NOT_A_BET';
  readonly reason: string | null;
  readonly overriddenAt: Date;
}

interface TransactionClassificationProperties {
  readonly userId: UniqueEntityId;
  readonly signals: DetectionSignals;
  /**
   * The normalised merchant name, which is what groups a house on the betting
   * screen. It is not a policy input — that is why it sits beside the signals
   * rather than inside them.
   */
  readonly counterparty: string;
  readonly policyVerdict: BetClassification | null;
  readonly bookmaker: BookmakerIdentity | null;
  readonly override: ClassificationOverride | null;
  readonly classifiedAt: Date;
}

/** What the chain and the registry are asked for together, every time. */
export interface DetectionContext {
  readonly chain: DetectionPolicyChain;
  readonly registry: BookmakerRegistry;
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
    readonly counterparty: string;
    readonly detection: DetectionContext;
    readonly classifiedAt: Date;
  }): TransactionClassification {
    const verdict = input.detection.chain.classify(input.signals);
    const classification = new TransactionClassification(input.transactionId, {
      userId: input.userId,
      signals: input.signals,
      counterparty: input.counterparty,
      policyVerdict: verdict,
      bookmaker: attributionFor(verdict, input.counterparty, input.signals, input.detection),
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

  get counterparty(): string {
    return this.properties.counterparty;
  }

  get policyVerdict(): BetClassification | null {
    return this.properties.policyVerdict;
  }

  get bookmaker(): BookmakerIdentity | null {
    return this.properties.bookmaker;
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

  /** The house the betting screen groups this row under, once it is a bet. */
  get effectiveBookmaker(): BookmakerIdentity | null {
    return this.effectiveClassification === null ? null : this.properties.bookmaker;
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
    readonly detection: DetectionContext;
    readonly revertedAt: Date;
  }): Result<void, BetDetectionError<'OVERRIDE_NOT_FOUND'>> {
    if (this.properties.override === null) {
      return fail(BetDetectionError.overrideNotFound());
    }

    const verdict = input.detection.chain.classify(this.properties.signals);

    this.properties = {
      ...this.properties,
      override: null,
      policyVerdict: verdict,
      bookmaker: this.attributionFrom(verdict, input.detection),
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
  reclassify(detection: DetectionContext, at: Date): void {
    const verdict = detection.chain.classify(this.properties.signals);
    const wasBet = this.properties.policyVerdict !== null;

    this.properties = {
      ...this.properties,
      policyVerdict: verdict,
      bookmaker: this.attributionFrom(verdict, detection),
      classifiedAt: at,
    };

    if (!wasBet) {
      this.announceIfBet(verdict, at);
    }
  }

  /**
   * The attribution is re-resolved whenever the chain runs, so a house the
   * registry gained since is a registered house from that moment on.
   */
  private attributionFrom(
    verdict: BetClassification | null,
    detection: DetectionContext,
  ): BookmakerIdentity | null {
    return attributionFor(verdict, this.properties.counterparty, this.properties.signals, detection);
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
