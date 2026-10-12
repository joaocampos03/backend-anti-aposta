import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { ConnectedAccountRepository } from '../domain/connected-account.repository.js';
import type {
  ConnectedAccountsOutput,
  ListConnectedAccountsInput,
} from './dto/accounts.dto.js';

/**
 * The accounts behind the filter and the detail dialog's labels.
 *
 * Only accounts covered by an authorised consent appear, so somebody who shared
 * one of two gets one item and the filter offers exactly what exists. An empty
 * list with no error is the "never connected" case — it is not a failure.
 *
 * @see docs/features/transactions.md
 */
export class ListConnectedAccounts
  implements UseCase<ListConnectedAccountsInput, ConnectedAccountsOutput>
{
  constructor(
    private readonly consents: ConsentRepository,
    private readonly accounts: ConnectedAccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ListConnectedAccountsInput,
  ): Promise<Result<ConnectedAccountsOutput, AppError>> {
    const consent = await this.consents.findAuthorisedByUserId(
      UniqueEntityId.restore(input.userId),
      this.clock.now(),
    );

    if (consent === null) {
      return ok({ items: [], nextCursor: null });
    }

    const accounts = await this.accounts.findByConsentId(consent.id);

    return ok({
      items: accounts.map((account) => ({
        id: account.id.value,
        institution: account.institution,
        shortName: account.shortName,
        product: account.product,
        maskedNumber: account.maskedNumber.value,
        kind: account.kind,
      })),
      nextCursor: null,
    });
  }
}
