import type { AppError } from '@shared/application/app-error.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { inferCategory } from '../domain/category-inference.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { ConnectedAccount } from '../domain/connected-account.js';
import type { ConnectedAccountRepository } from '../domain/connected-account.repository.js';
import { Counterparty } from '../domain/counterparty.js';
import { TransactionsIngested } from '../domain/events/transactions-ingested.js';
import { MaskedAccountNumber } from '../domain/masked-account-number.js';
import { Transaction } from '../domain/transaction.js';
import type { TransactionRepository } from '../domain/transaction.repository.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type { DataHolder, SharedAccount, SharedTransaction } from './ports/data-holder.port.js';
import type { TransactionClassifier } from './ports/transaction-classifier.port.js';

/** Twelve months back, the longest a consent can reach. */
const HISTORY_IN_DAYS = 365;
/** Far enough forward to see entries booked for a future date. */
const FUTURE_IN_DAYS = 31;
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export interface StatementSynchronisationDependencies {
  readonly dataHolder: DataHolder;
  readonly consents: ConsentRepository;
  readonly accounts: ConnectedAccountRepository;
  readonly transactions: TransactionRepository;
  readonly classifier: TransactionClassifier;
  readonly idGenerator: IdGenerator;
  readonly events: EventPublisher;
}

/**
 * Pulls what an authorised consent shares — the accounts, then each account's
 * statement — and ingests what is new.
 *
 * Idempotent by construction: a transaction is new only if its DataHolder id is
 * not already on that account, so synchronising twice ingests nothing the
 * second time. That is what makes "Sincronizar" safe to press again, and why
 * the endpoint needs no `Idempotency-Key`.
 *
 * Each new transaction goes through `Transaction.ingest`, which asks the
 * consent every time, and is then handed to `bet-detection` with the raw line.
 */
export class StatementSynchronisation {
  constructor(private readonly dependencies: StatementSynchronisationDependencies) {}

  async synchronise(
    consent: Consent,
    accessToken: string,
    moment: Date,
  ): Promise<Result<number, AppError>> {
    const shared = await this.dependencies.dataHolder.listAccounts(accessToken);

    if (!shared.ok) {
      return fail(openFinanceFailures.fromDataHolder(shared.error));
    }

    const accounts = await this.connect(consent, shared.value, moment);
    const ingestedIds: UniqueEntityId[] = [];

    for (const account of accounts) {
      const ingested = await this.ingestStatement(consent, account, accessToken, moment);

      if (!ingested.ok) {
        return ingested;
      }

      ingestedIds.push(...ingested.value);
    }

    await this.finish(consent, ingestedIds, moment);

    return ok(ingestedIds.length);
  }

  /** Accounts already connected are kept; an account shared for the first time is added. */
  private async connect(
    consent: Consent,
    shared: readonly SharedAccount[],
    moment: Date,
  ): Promise<readonly ConnectedAccount[]> {
    const known = await this.dependencies.accounts.findByConsentId(consent.id);
    const added = shared
      .filter((account) => !known.some((existing) => existing.externalId === account.externalId))
      .map((account) => this.connectOne(consent, account, moment));

    for (const account of added) {
      await this.dependencies.accounts.save(account);
    }

    return [...known, ...added];
  }

  private connectOne(consent: Consent, shared: SharedAccount, moment: Date): ConnectedAccount {
    return ConnectedAccount.connect({
      id: this.dependencies.idGenerator.generate(),
      userId: consent.userId,
      consentId: consent.id,
      externalId: shared.externalId,
      institution: shared.institution,
      shortName: shared.shortName,
      product: shared.product,
      maskedNumber: MaskedAccountNumber.maskingAtIngestion(shared.fullNumber),
      kind: shared.kind,
      connectedAt: moment,
    });
  }

  private async ingestStatement(
    consent: Consent,
    account: ConnectedAccount,
    accessToken: string,
    moment: Date,
  ): Promise<Result<readonly UniqueEntityId[], AppError>> {
    const statement = await this.dependencies.dataHolder.listTransactions({
      accessToken,
      account: { externalId: account.externalId, kind: account.kind },
      from: new Date(moment.getTime() - HISTORY_IN_DAYS * MILLISECONDS_IN_A_DAY),
      to: new Date(moment.getTime() + FUTURE_IN_DAYS * MILLISECONDS_IN_A_DAY),
    });

    if (!statement.ok) {
      return fail(openFinanceFailures.fromDataHolder(statement.error));
    }

    const fresh = await this.notYetIngested(account, statement.value);
    const ingestedIds: UniqueEntityId[] = [];

    for (const row of fresh) {
      const ingested = await this.ingestOne(consent, account, row, moment);

      if (!ingested.ok) {
        return ingested;
      }

      ingestedIds.push(ingested.value);
    }

    return ok(ingestedIds);
  }

  private async notYetIngested(
    account: ConnectedAccount,
    rows: readonly SharedTransaction[],
  ): Promise<readonly SharedTransaction[]> {
    const already = await this.dependencies.transactions.findIngestedExternalIds(
      account.id,
      rows.map((row) => row.externalId),
    );

    return rows.filter((row) => !already.has(row.externalId));
  }

  private async ingestOne(
    consent: Consent,
    account: ConnectedAccount,
    row: SharedTransaction,
    moment: Date,
  ): Promise<Result<UniqueEntityId, AppError>> {
    const transaction = this.build(consent, account, row, moment);

    if (!transaction.ok) {
      return transaction;
    }

    await this.dependencies.transactions.save(transaction.value);
    await this.dependencies.classifier.classify({
      userId: consent.userId.value,
      transactionId: transaction.value.id.value,
      merchantCategoryCode: row.merchantCategoryCode,
      counterpartyDocument: row.counterpartyDocument,
      statementLine: row.statementLine,
    });

    return ok(transaction.value.id);
  }

  private build(
    consent: Consent,
    account: ConnectedAccount,
    row: SharedTransaction,
    moment: Date,
  ): Result<Transaction, AppError> {
    const amount = Money.fromCents(row.amountInCents);
    const counterparty = Counterparty.create(row.statementLine);

    if (!amount.ok || !counterparty.ok) {
      return fail(openFinanceFailures.fromDataHolder('UNAVAILABLE'));
    }

    const transaction = Transaction.ingest({
      id: this.dependencies.idGenerator.generate(),
      consent,
      accountId: account.id,
      externalId: row.externalId,
      occurredAt: row.occurredAt,
      amount: amount.value,
      counterparty: counterparty.value,
      category: inferCategory({
        merchantCategoryCode: row.merchantCategoryCode,
        isCredit: amount.value.isCredit(),
        method: row.method,
      }),
      method: row.method,
      status: row.status,
      ingestedAt: moment,
    });

    return transaction.ok ? transaction : fail(openFinanceFailures.fromDomain(transaction.error));
  }

  private async finish(
    consent: Consent,
    ingestedIds: readonly UniqueEntityId[],
    moment: Date,
  ): Promise<void> {
    consent.markSynced(moment);
    await this.dependencies.consents.save(consent);

    if (ingestedIds.length === 0) {
      return;
    }

    await this.dependencies.events.publish([
      new TransactionsIngested({
        userId: consent.userId,
        transactionIds: ingestedIds,
        ingestedAt: moment,
      }),
    ]);
  }
}
