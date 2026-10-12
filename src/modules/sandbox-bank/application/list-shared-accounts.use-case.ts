import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankAccount } from '../domain/bank-account.js';
import type { BankAccountRepository } from '../domain/bank-account.repository.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type {
  SharedAccountDto,
  SharedAccountsOutput,
  SharedResourceInput,
} from './dto/protocol.dto.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

/**
 * `GET /accounts`: exactly the accounts the customer picked on the
 * authorisation screen, and nothing else they hold.
 *
 * The number and check digit go out in full, as the specification sends them.
 * Minimising them is the DataRecipient's obligation, and `open-finance` meets
 * it the moment the response arrives.
 */
export class ListSharedAccounts implements UseCase<SharedResourceInput, SharedAccountsOutput> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly accounts: BankAccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: SharedResourceInput): Promise<Result<SharedAccountsOutput, AppError>> {
    const consent = await this.consents.findById(UniqueEntityId.restore(input.consentId));

    if (consent === null || !consent.isActiveAt(this.clock.now())) {
      return fail(sandboxBankFailures.consentNotActive());
    }

    const accounts = await this.accounts.findByIds(consent.accountIds);

    return ok({ accounts: accounts.map(toSharedAccountDto) });
  }
}

function toSharedAccountDto(account: BankAccount): SharedAccountDto {
  return {
    accountId: account.id.value,
    type: account.type,
    brandName: account.brandName,
    companyCnpj: account.companyCnpj,
    compeCode: account.compeCode,
    branchCode: account.branchCode,
    number: account.number,
    checkDigit: account.checkDigit,
  };
}
