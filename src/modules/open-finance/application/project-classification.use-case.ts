import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { TransactionRepository } from '../domain/transaction.repository.js';
import type { ClassificationReader } from './ports/classification-reader.port.js';

export interface ProjectClassificationInput {
  readonly userId: string;
  readonly transactionId: string;
}

/**
 * Keeps this context's copy of the verdict current.
 *
 * It runs on `BetTransactionDetected` and on `BetClassificationOverridden`, and
 * it **re-reads** rather than trusting a payload: the events carry ids only, by
 * design, so that no financial judgement is laundered through an event bus.
 *
 * The copy is what lets the statement filter and total in one query instead of
 * joining across contexts — which is the line that keeps the two contexts two.
 */
export class ProjectClassification implements UseCase<ProjectClassificationInput, void> {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly classifications: ClassificationReader,
  ) {}

  async execute(input: ProjectClassificationInput): Promise<Result<void, AppError>> {
    const transaction = await this.transactions.findByIdAndUserId(
      UniqueEntityId.restore(input.transactionId),
      UniqueEntityId.restore(input.userId),
    );

    if (transaction === null) {
      return ok(undefined);
    }

    const verdict = await this.classifications.effectiveFor(input.transactionId, input.userId);

    transaction.projectClassification(verdict?.bet ?? null);
    await this.transactions.save(transaction);
    await this.transactions.markOverride(
      UniqueEntityId.restore(input.transactionId),
      verdict?.overriddenAt ?? null,
    );

    return ok(undefined);
  }
}
