import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankAccountRepository } from '../domain/bank-account.repository.js';
import { toCustomerAccountDto } from './demo-account-opening.js';
import type { CustomerAccountsOutput } from './dto/bank-app.dto.js';

export interface ListBookableAccountsInput {
  readonly customerId: string;
}

/**
 * The demonstration console's view of somebody's accounts at the bank, so a
 * movement can be booked for them. Unlike the bank's own screen it opens
 * nothing: the bank cannot tell a real customer id from a typo, and a typo
 * must not leave a checking account and a card behind. A customer who never
 * reached the bank has no accounts here yet.
 */
export class ListBookableAccounts
  implements UseCase<ListBookableAccountsInput, CustomerAccountsOutput>
{
  constructor(private readonly accounts: BankAccountRepository) {}

  async execute(input: ListBookableAccountsInput): Promise<Result<CustomerAccountsOutput, AppError>> {
    const accounts = await this.accounts.findByCustomerId(UniqueEntityId.restore(input.customerId));

    return ok({ items: accounts.map(toCustomerAccountDto), nextCursor: null });
  }
}
