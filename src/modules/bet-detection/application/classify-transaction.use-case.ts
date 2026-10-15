import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Cnpj } from '../domain/cnpj.js';
import { DetectionPolicyChain } from '../domain/detection-policy-chain.js';
import { DetectionSignals } from '../domain/detection-signals.js';
import { TransactionClassification } from '../domain/transaction-classification.js';
import type { TransactionClassificationRepository } from '../domain/transaction-classification.repository.js';
import type { ClassifyTransactionInput } from './dto/classify.dto.js';
import type { BookmakerRegistryReader } from './ports/bookmaker-registry-reader.port.js';

export interface ClassifyTransactionDependencies {
  readonly classifications: TransactionClassificationRepository;
  readonly bookmakers: BookmakerRegistryReader;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * Runs the policy chain over one transaction and records what it decided.
 *
 * It has no HTTP route: ingestion calls it. A transaction already corrected by
 * its owner keeps the correction — re-running the chain never overturns a
 * person's own verdict.
 *
 * @see docs/features/transactions.md
 */
export class ClassifyTransaction implements UseCase<ClassifyTransactionInput, void> {
  constructor(private readonly dependencies: ClassifyTransactionDependencies) {}

  async execute(input: ClassifyTransactionInput): Promise<Result<void, AppError>> {
    const transactionId = UniqueEntityId.restore(input.transactionId);
    const userId = UniqueEntityId.restore(input.userId);
    const registry = await this.dependencies.bookmakers.current();
    const detection = { chain: DetectionPolicyChain.standard(registry), registry };
    const now = this.dependencies.clock.now();

    const existing = await this.dependencies.classifications.findByTransactionIdAndUserId(
      transactionId,
      userId,
    );

    const classification =
      existing ??
      TransactionClassification.classify({
        transactionId,
        userId,
        signals: this.signalsFrom(input),
        counterparty: input.counterparty ?? '',
        detection,
        classifiedAt: now,
      });

    if (existing !== null) {
      existing.reclassify(detection, now);
    }

    await this.dependencies.classifications.save(classification);
    await this.dependencies.events.publish(classification.pullEvents());

    return ok(undefined);
  }

  private signalsFrom(input: ClassifyTransactionInput): DetectionSignals {
    const document =
      input.counterpartyDocument === null || input.counterpartyDocument === undefined
        ? null
        : Cnpj.create(input.counterpartyDocument);

    return DetectionSignals.of({
      mcc: input.mcc ?? null,
      counterpartyDocument: document !== null && document.ok ? document.value : null,
      description: input.description ?? '',
    });
  }
}
