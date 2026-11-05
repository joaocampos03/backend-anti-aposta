import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { DataHolder } from './ports/data-holder.port.js';

export interface EraseOpenFinanceAccountInput {
  readonly userId: string;
}

/**
 * The end of an account, which goes further than revocation: the consents
 * themselves go too, and the accounts, statement, tokens and authorisations
 * cascade from them in one statement.
 *
 * The institution is told about any consent still authorised, best effort as in
 * `RevokeConsent`: an erasure the person is owed cannot wait on a third party.
 * Idempotent: a second run finds nothing to tell and nothing to delete.
 */
export class EraseOpenFinanceAccount implements UseCase<EraseOpenFinanceAccountInput, void> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly dataHolder: DataHolder,
  ) {}

  async execute(input: EraseOpenFinanceAccountInput): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);
    const consents = await this.consents.findAllByUserId(userId);

    await this.consents.deleteAllForUser(userId);

    for (const consent of consents) {
      if (consent.status === 'AUTHORISED') {
        await this.dataHolder.revokeConsent(consent.externalConsentId);
      }
    }

    return ok(undefined);
  }
}
