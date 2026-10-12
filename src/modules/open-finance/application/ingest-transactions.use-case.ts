import { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { Counterparty } from '../domain/counterparty.js';
import { TransactionsIngested } from '../domain/events/transactions-ingested.js';
import type { Transaction } from '../domain/transaction.js';
import { Transaction as TransactionAggregate } from '../domain/transaction.js';
import type { TransactionRepository } from '../domain/transaction.repository.js';
import type {
  IngestedTransaction,
  IngestTransactionsInput,
  IngestTransactionsOutput,
} from './dto/ingestion.dto.js';

export interface IngestTransactionsDependencies {
  readonly consents: ConsentRepository;
  readonly transactions: TransactionRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * Writes what a connected account shared.
 *
 * It has no HTTP route: the Open Finance flow calls it once that feature
 * exists, and the synthetic seed calls it today. Every transaction goes through
 * the `Consent` aggregate on the way in, which is where "no financial data
 * without an authorised consent" is actually enforced rather than merely
 * intended.
 *
 * It does not classify. Detection is `bet-detection`'s work, over signals this
 * context never stores — the raw statement line included.
 *
 * @see docs/features/transactions.md
 */
export class IngestTransactions
  implements UseCase<IngestTransactionsInput, IngestTransactionsOutput>
{
  constructor(private readonly dependencies: IngestTransactionsDependencies) {}

  async execute(
    input: IngestTransactionsInput,
  ): Promise<Result<IngestTransactionsOutput, AppError>> {
    const now = this.dependencies.clock.now();
    const consent = await this.dependencies.consents.findAuthorisedByUserId(
      UniqueEntityId.restore(input.userId),
      now,
    );

    if (consent === null) {
      return fail(
        new AppError('CONSENT_NOT_AUTHORISED', 'Nenhum consentimento ativo para esta conta.', 422),
      );
    }

    const ingested: Transaction[] = [];

    for (const row of input.transactions) {
      const transaction = this.buildOne(consent, row, now);

      if (!transaction.ok) {
        return transaction;
      }

      await this.dependencies.transactions.save(transaction.value);
      ingested.push(transaction.value);
    }

    consent.markSynced(now);
    await this.dependencies.consents.save(consent);

    await this.dependencies.events.publish([
      new TransactionsIngested({
        userId: consent.userId,
        transactionIds: ingested.map((transaction) => transaction.id),
        ingestedAt: now,
      }),
    ]);

    return ok({ transactionIds: ingested.map((transaction) => transaction.id.value) });
  }

  private buildOne(
    consent: Consent,
    row: IngestedTransaction,
    now: Date,
  ): Result<Transaction, AppError> {
    const amount = Money.fromCents(row.amountInCents);
    const counterparty = Counterparty.create(row.counterparty);

    if (!amount.ok || !counterparty.ok) {
      return fail(
        new AppError('MALFORMED_TRANSACTION', 'Não foi possível ler uma das transações.', 422),
      );
    }

    const transaction = TransactionAggregate.ingest({
      id: this.dependencies.idGenerator.generate(),
      consent,
      accountId: UniqueEntityId.restore(row.accountId),
      occurredAt: row.occurredAt,
      amount: amount.value,
      counterparty: counterparty.value,
      category: row.category,
      method: row.method,
      status: row.status,
      ingestedAt: now,
    });

    if (!transaction.ok) {
      return fail(
        new AppError('CONSENT_NOT_AUTHORISED', 'Nenhum consentimento ativo para esta conta.', 422),
      );
    }

    return ok(transaction.value);
  }
}
