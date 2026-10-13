import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { toCustomerAccountDto, type DemoAccountOpening } from './demo-account-opening.js';
import type { CustomerAccountsOutput } from './dto/bank-app.dto.js';

export interface ListCustomerAccountsInput {
  readonly customerId: string;
}

/**
 * The customer's own accounts at the sandbox, for the screen that books new
 * entries on them. Opens the demo accounts on first contact, exactly as the
 * authorisation screen does, so either screen can come first.
 */
export class ListCustomerAccounts
  implements UseCase<ListCustomerAccountsInput, CustomerAccountsOutput>
{
  constructor(
    private readonly demoAccounts: DemoAccountOpening,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ListCustomerAccountsInput,
  ): Promise<Result<CustomerAccountsOutput, AppError>> {
    const accounts = await this.demoAccounts.ensureFor(
      UniqueEntityId.restore(input.customerId),
      this.clock.now(),
    );

    return ok({ items: accounts.map(toCustomerAccountDto), nextCursor: null });
  }
}
