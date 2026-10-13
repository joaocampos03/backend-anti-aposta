import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { AuthorisationRequestRepository } from '../domain/authorisation-request.repository.js';
import type { ConnectedAccountRepository } from '../domain/connected-account.repository.js';
import type { TransactionRepository } from '../domain/transaction.repository.js';
import type { ConsentTokenVault } from './ports/consent-token-vault.port.js';

export interface PurgeUserFinancialDataInput {
  readonly userId: string;
}

export interface PurgeUserFinancialDataDependencies {
  readonly transactions: TransactionRepository;
  readonly accounts: ConnectedAccountRepository;
  readonly tokens: ConsentTokenVault;
  readonly authorisationRequests: AuthorisationRequestRepository;
}

/**
 * Reaction to `ConsentRevoked`.
 *
 * Revocation deletes the derived data, not just the token: the rows are gone
 * from the database rather than filtered out of a response. The screens return
 * to "connect an account" because there is genuinely nothing left, and the copy
 * never implies the data is merely hidden (LGPD art. 18). The DataHolder's
 * tokens and any authorisation still in flight go with them.
 *
 * Idempotent: revoking twice deletes nothing the second time.
 */
export class PurgeUserFinancialData implements UseCase<PurgeUserFinancialDataInput, void> {
  constructor(private readonly dependencies: PurgeUserFinancialDataDependencies) {}

  async execute(input: PurgeUserFinancialDataInput): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);

    await this.dependencies.transactions.deleteAllForUser(userId);
    await this.dependencies.accounts.deleteAllForUser(userId);
    await this.dependencies.tokens.deleteAllForUser(userId.value);
    await this.dependencies.authorisationRequests.deleteAllForUser(userId);

    return ok(undefined);
  }
}
