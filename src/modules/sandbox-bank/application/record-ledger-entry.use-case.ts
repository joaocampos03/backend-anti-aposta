import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankAccount } from '../domain/bank-account.js';
import type { BankAccountRepository } from '../domain/bank-account.repository.js';
import { LedgerEntry } from '../domain/ledger-entry.js';
import type { LedgerEntryRepository } from '../domain/ledger-entry.repository.js';
import { SandboxBankError } from '../domain/sandbox-bank.errors.js';
import type { LedgerEntryDto, RecordLedgerEntryInput } from './dto/bank-app.dto.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

/**
 * Books a movement at the simulated bank — "I just paid R$ 50 to a bookmaker" —
 * on one of the customer's own accounts.
 *
 * It writes to the bank and nowhere else. The platform learns about the entry
 * the way it would from a real institution: the next time it synchronises.
 * Nothing here reaches into `open-finance`.
 */
export class RecordLedgerEntry implements UseCase<RecordLedgerEntryInput, LedgerEntryDto> {
  constructor(
    private readonly accounts: BankAccountRepository,
    private readonly ledger: LedgerEntryRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RecordLedgerEntryInput): Promise<Result<LedgerEntryDto, AppError>> {
    const account = await this.accounts.findByIdAndCustomerId(
      UniqueEntityId.restore(input.accountId),
      UniqueEntityId.restore(input.customerId),
    );

    if (account === null) {
      return fail(sandboxBankFailures.accountNotFound());
    }

    const booked = this.book(account, input);

    if (!booked.ok) {
      return fail(sandboxBankFailures.fromDomain(booked.error));
    }

    await this.ledger.save(booked.value);

    return ok(toLedgerEntryDto(booked.value));
  }

  private book(
    account: BankAccount,
    input: RecordLedgerEntryInput,
  ): Result<LedgerEntry, SandboxBankError<'INVALID_LEDGER_ENTRY'>> {
    const amount = Money.fromCents(input.amountInCents);

    if (!amount.ok) {
      return fail(SandboxBankError.invalidLedgerEntry());
    }

    return LedgerEntry.book({
      id: this.idGenerator.generate(),
      account,
      bookedAt: input.bookedAt ?? this.clock.now(),
      amount: amount.value,
      transactionName: input.transactionName,
      type: input.type,
      status: input.status,
      merchantCategoryCode: input.merchantCategoryCode,
      payeeDocument: input.payeeDocument,
    });
  }
}

function toLedgerEntryDto(entry: LedgerEntry): LedgerEntryDto {
  return {
    id: entry.id.value,
    accountId: entry.accountId.value,
    bookedAt: entry.bookedAt.toISOString(),
    amountInCents: entry.amount.amountInCents,
    transactionName: entry.transactionName,
    type: entry.type,
    status: entry.status,
    merchantCategoryCode: entry.merchantCategoryCode,
    payeeDocument: entry.payeeDocument,
  };
}
