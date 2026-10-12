import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { assertNever } from '@shared/domain/assert-never.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BetDetectionErrorCode } from '../domain/bet-detection.errors.js';
import type { TransactionClassificationRepository } from '../domain/transaction-classification.repository.js';
import { betDetectionFailures } from './bet-detection.failures.js';
import type { ClassificationOutput, ReclassifyTransactionInput } from './dto/override.dto.js';

export interface ReclassifyTransactionDependencies {
  readonly classifications: TransactionClassificationRepository;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

type OverrideErrorCode = Extract<
  BetDetectionErrorCode,
  'NOT_CLASSIFIED_AS_BET' | 'ALREADY_OVERRIDDEN'
>;

/**
 * Records "isto não é uma aposta" and lets everything derived recompute.
 *
 * The endpoint behind it must never fake success: somebody who believes they
 * corrected a number that is still wrong is worse off than somebody with no
 * button at all. Every refusal here is a visible failure, and none of them
 * disputes the correction.
 *
 * @see docs/features/transactions.md
 */
export class ReclassifyTransaction
  implements UseCase<ReclassifyTransactionInput, ClassificationOutput>
{
  constructor(private readonly dependencies: ReclassifyTransactionDependencies) {}

  async execute(
    input: ReclassifyTransactionInput,
  ): Promise<Result<ClassificationOutput, AppError>> {
    const classification = await this.dependencies.classifications.findByTransactionIdAndUserId(
      UniqueEntityId.restore(input.transactionId),
      UniqueEntityId.restore(input.userId),
    );

    if (classification === null) {
      return fail(betDetectionFailures.transactionNotFound());
    }

    const overridden = classification.overrideAsNotABet({
      reason: input.reason ?? null,
      overriddenAt: this.dependencies.clock.now(),
    });

    if (!overridden.ok) {
      return fail(this.refusalFor(overridden.error.code));
    }

    await this.dependencies.classifications.save(classification);
    await this.dependencies.events.publish(classification.pullEvents());

    const override = classification.override;

    return ok({
      // It is no longer a bet, so there is nothing left to reframe.
      transaction: { id: input.transactionId, bet: null, yieldEquivalent: null },
      override:
        override === null
          ? null
          : {
              verdict: override.verdict,
              overriddenAt: override.overriddenAt.toISOString(),
              isReversible: true,
            },
    });
  }

  private refusalFor(code: OverrideErrorCode): AppError {
    switch (code) {
      case 'NOT_CLASSIFIED_AS_BET':
        return betDetectionFailures.notClassifiedAsBet();
      case 'ALREADY_OVERRIDDEN':
        return betDetectionFailures.alreadyOverridden();
      default:
        return assertNever(code);
    }
  }
}
