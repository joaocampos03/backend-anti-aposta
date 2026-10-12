import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { TransactionClassificationRepository } from '../domain/transaction-classification.repository.js';

export interface ForgetUserClassificationsInput {
  readonly userId: string;
}

/**
 * Reaction to `ConsentRevoked`. The classifications are derived from financial
 * data, so they go with it — and so does the one place the raw statement line
 * was ever kept.
 */
export class ForgetUserClassifications
  implements UseCase<ForgetUserClassificationsInput, void>
{
  constructor(private readonly classifications: TransactionClassificationRepository) {}

  async execute(input: ForgetUserClassificationsInput): Promise<Result<void, AppError>> {
    await this.classifications.deleteAllForUser(UniqueEntityId.restore(input.userId));

    return ok(undefined);
  }
}
