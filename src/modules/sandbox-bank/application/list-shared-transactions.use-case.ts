import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { LedgerEntry } from '../domain/ledger-entry.js';
import type {
  LedgerEntryRepository,
  StatementWindow,
} from '../domain/ledger-entry.repository.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type {
  ListSharedTransactionsInput,
  SharedTransactionDto,
  SharedTransactionsOutput,
} from './dto/protocol.dto.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

/**
 * Twelve months back, matching the longest consent; and forward far enough to
 * include entries booked for a future date.
 */
const DEFAULT_WINDOW_IN_DAYS = 365;
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

/**
 * `GET /accounts/{accountId}/transactions`: one page of one shared account's
 * statement. An account the consent does not share answers exactly like one
 * that does not exist.
 */
export class ListSharedTransactions
  implements UseCase<ListSharedTransactionsInput, SharedTransactionsOutput>
{
  constructor(
    private readonly consents: ConsentRepository,
    private readonly ledger: LedgerEntryRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ListSharedTransactionsInput,
  ): Promise<Result<SharedTransactionsOutput, AppError>> {
    const now = this.clock.now();
    const consent = await this.consents.findById(UniqueEntityId.restore(input.consentId));

    if (consent === null || !consent.isActiveAt(now)) {
      return fail(sandboxBankFailures.consentNotActive());
    }

    if (!consent.permissions.includes('ACCOUNTS_TRANSACTIONS_READ')) {
      return fail(sandboxBankFailures.permissionNotGranted());
    }

    const accountId = UniqueEntityId.restore(input.accountId);

    if (!consent.sharesAccountAt(accountId, now)) {
      return fail(sandboxBankFailures.accountNotFound());
    }

    const page = await this.ledger.findPageByAccountId(accountId, windowOf(input, now), {
      number: input.page,
      size: input.pageSize,
    });

    return ok({
      transactions: page.entries.map(toSharedTransactionDto),
      page: input.page,
      pageSize: input.pageSize,
      totalRecords: page.totalRecords,
      totalPages: Math.max(Math.ceil(page.totalRecords / input.pageSize), 1),
    });
  }
}

function windowOf(input: ListSharedTransactionsInput, now: Date): StatementWindow {
  const span = DEFAULT_WINDOW_IN_DAYS * MILLISECONDS_IN_A_DAY;

  return {
    from: input.fromBookingDate ?? new Date(now.getTime() - span),
    to: input.toBookingDate ?? new Date(now.getTime() + span),
  };
}

function toSharedTransactionDto(entry: LedgerEntry): SharedTransactionDto {
  return {
    transactionId: entry.id.value,
    status: entry.status,
    type: entry.type,
    transactionName: entry.transactionName,
    amountInCents: entry.amount.amountInCents,
    bookedAt: entry.bookedAt.toISOString(),
    merchantCategoryCode: entry.merchantCategoryCode,
    payeeDocument: entry.payeeDocument,
  };
}
