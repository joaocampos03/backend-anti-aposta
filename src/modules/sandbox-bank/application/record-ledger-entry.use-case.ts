import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankAccount } from '../domain/bank-account.js';
import type { BankAccountRepository } from '../domain/bank-account.repository.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { LedgerEntry } from '../domain/ledger-entry.js';
import type { LedgerEntryRepository } from '../domain/ledger-entry.repository.js';
import { SandboxBankError } from '../domain/sandbox-bank.errors.js';
import type { LedgerEntryDto, RecordLedgerEntryInput } from './dto/bank-app.dto.js';
import type { ClientRegistry } from './ports/client-registry.port.js';
import type { DataRecipientNotifier } from './ports/data-recipient-notifier.port.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

export interface RecordLedgerEntryDependencies {
  readonly accounts: BankAccountRepository;
  readonly ledger: LedgerEntryRepository;
  readonly consents: ConsentRepository;
  readonly clients: ClientRegistry;
  readonly notifier: DataRecipientNotifier;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * Books a movement at the simulated bank — "I just paid R$ 50 to a bookmaker" —
 * on one of the customer's own accounts.
 *
 * It writes to the bank and nowhere else. Then, like an institution with a
 * notification channel, it tells each DataRecipient whose active consent
 * shares that account that something changed — and only that. Nothing here
 * reaches into `open-finance`: the recipient reads the entry over the protocol,
 * with its own token, exactly as it reads every other.
 */
export class RecordLedgerEntry implements UseCase<RecordLedgerEntryInput, LedgerEntryDto> {
  constructor(private readonly dependencies: RecordLedgerEntryDependencies) {}

  async execute(input: RecordLedgerEntryInput): Promise<Result<LedgerEntryDto, AppError>> {
    const account = await this.dependencies.accounts.findByIdAndCustomerId(
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

    await this.dependencies.ledger.save(booked.value);
    await this.noticeSharingConsents(account);

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
      id: this.dependencies.idGenerator.generate(),
      account,
      bookedAt: input.bookedAt ?? this.dependencies.clock.now(),
      amount: amount.value,
      transactionName: input.transactionName,
      type: input.type,
      status: input.status,
      merchantCategoryCode: input.merchantCategoryCode,
      payeeDocument: input.payeeDocument,
    });
  }

  /** A consent that lapsed or no longer covers the account hears nothing. */
  private async noticeSharingConsents(account: BankAccount): Promise<void> {
    const now = this.dependencies.clock.now();
    const consents = await this.dependencies.consents.findAuthorisedSharingAccount(account.id);

    for (const consent of consents.filter((shared) => shared.sharesAccountAt(account.id, now))) {
      const client = this.dependencies.clients.findById(consent.clientId);

      if (client !== null) {
        await this.dependencies.notifier.resourcesChanged({ client, consentId: consent.id });
      }
    }
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
