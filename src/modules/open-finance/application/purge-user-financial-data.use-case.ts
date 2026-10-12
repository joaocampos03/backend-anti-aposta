import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConnectedAccountRepository } from '../domain/connected-account.repository.js';
import type { TransactionRepository } from '../domain/transaction.repository.js';

export interface PurgeUserFinancialDataInput {
  readonly userId: string;
}

/**
 * Reaction to `ConsentRevoked`.
 *
 * Revocation deletes the derived data, not just the token: the rows are gone
 * from the database rather than filtered out of a response. The screens return
 * to "connect an account" because there is genuinely nothing left, and the copy
 * never implies the data is merely hidden (LGPD art. 18).
 *
 * Idempotent: revoking twice deletes nothing the second time.
 */
export class PurgeUserFinancialData implements UseCase<PurgeUserFinancialDataInput, void> {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly accounts: ConnectedAccountRepository,
  ) {}

  async execute(input: PurgeUserFinancialDataInput): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);

    await this.transactions.deleteAllForUser(userId);
    await this.accounts.deleteAllForUser(userId);

    return ok(undefined);
  }
}
