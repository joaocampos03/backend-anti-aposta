import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BetClassification } from '../domain/bet-classification.js';
import type { TransactionClassificationRepository } from '../domain/transaction-classification.repository.js';
import { betDetectionFailures } from './bet-detection.failures.js';
import type {
  ClassificationOutput,
  MoneyDto,
  RevertReclassificationInput,
} from './dto/override.dto.js';
import type { BookmakerRegistryReader } from './ports/bookmaker-registry-reader.port.js';
import type { ClassifiedTransactionReader } from './ports/classified-transaction-reader.port.js';
import type { YieldCalculator } from './ports/yield-calculator.port.js';
import { DetectionPolicyChain } from '../domain/detection-policy-chain.js';

export interface RevertReclassificationDependencies {
  readonly classifications: TransactionClassificationRepository;
  readonly bookmakers: BookmakerRegistryReader;
  readonly transactions: ClassifiedTransactionReader;
  readonly yields: YieldCalculator;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * Undoes a correction, restoring the policy chain's verdict.
 *
 * The verdict is **re-read** rather than remembered: the registry is resolved
 * now, so a bookmaker added since the correction yields the current answer. A
 * remembered verdict would quietly preserve a judgement the product has since
 * changed its mind about.
 *
 * @see docs/features/transactions.md
 */
export class RevertReclassification
  implements UseCase<RevertReclassificationInput, ClassificationOutput>
{
  constructor(private readonly dependencies: RevertReclassificationDependencies) {}

  async execute(
    input: RevertReclassificationInput,
  ): Promise<Result<ClassificationOutput, AppError>> {
    const classification = await this.dependencies.classifications.findByTransactionIdAndUserId(
      UniqueEntityId.restore(input.transactionId),
      UniqueEntityId.restore(input.userId),
    );

    if (classification === null) {
      return fail(betDetectionFailures.transactionNotFound());
    }

    const registry = await this.dependencies.bookmakers.current();
    const reverted = classification.revertOverride({
      detection: { chain: DetectionPolicyChain.standard(registry), registry },
      revertedAt: this.dependencies.clock.now(),
    });

    if (!reverted.ok) {
      return fail(betDetectionFailures.overrideNotFound());
    }

    await this.dependencies.classifications.save(classification);
    await this.dependencies.events.publish(classification.pullEvents());

    return ok({
      transaction: {
        id: input.transactionId,
        bet: this.presentBet(classification.effectiveClassification),
        yieldEquivalent: await this.reframe(classification.isBet, input),
      },
      override: null,
    });
  }

  private presentBet(classification: BetClassification | null): ClassificationOutput['transaction']['bet'] {
    if (classification === null) {
      return null;
    }

    return {
      matchedBy: classification.matchedBy,
      confidence: classification.confidence,
      source: classification.source,
    };
  }

  /** The reframing travels with the amount it reframes, never fetched separately. */
  private async reframe(
    isBet: boolean,
    input: RevertReclassificationInput,
  ): Promise<MoneyDto | null> {
    if (!isBet) {
      return null;
    }

    const amountInCents = await this.dependencies.transactions.amountInCentsOf(
      input.transactionId,
      input.userId,
    );

    if (amountInCents === null) {
      return null;
    }

    return {
      amountInCents: this.dependencies.yields.reframe(amountInCents).futureValueInCents,
      currency: 'BRL',
    };
  }
}
