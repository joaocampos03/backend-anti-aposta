import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { Money } from '@shared/domain/money.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BankAccount } from './bank-account.js';
import { SandboxBankError } from './sandbox-bank.errors.js';

/** The specification's own names for how money moved. A subset of them. */
export type EntryType =
  | 'PIX'
  | 'TED'
  | 'BOLETO'
  | 'CONVENIO_ARRECADACAO'
  | 'CARTAO'
  | 'FOLHA_PAGAMENTO'
  | 'TRANSFERENCIA_MESMA_INSTITUICAO';

/** Settled, or booked for a future date and still able to change. */
export type EntryStatus = 'TRANSACAO_EFETIVADA' | 'LANCAMENTO_FUTURO';

const TRANSACTION_NAME_MAXIMUM_LENGTH = 140;
const LARGEST_MCC = 9999;
/** CPF has 11 digits and CNPJ 14; the specification's party field takes either. */
const DOCUMENT_LENGTHS: readonly number[] = [11, 14];
const ONLY_DIGITS = /^\d+$/;

interface LedgerEntryProperties {
  readonly accountId: UniqueEntityId;
  readonly customerId: UniqueEntityId;
  readonly bookedAt: Date;
  /** Signed: negative leaves the account. */
  readonly amount: Money;
  /** The raw statement line, exactly as the bank prints it. */
  readonly transactionName: string;
  readonly type: EntryType;
  readonly status: EntryStatus;
  readonly merchantCategoryCode: number | null;
  readonly payeeDocument: string | null;
}

export type LedgerEntryDraft = Omit<LedgerEntryProperties, 'accountId' | 'customerId'>;

/**
 * One line on a statement at the simulated bank. Immutable once booked, as a
 * bank's ledger is: a correction is a new entry, never an edit.
 */
export class LedgerEntry extends AggregateRoot {
  private constructor(
    id: UniqueEntityId,
    private readonly properties: LedgerEntryProperties,
  ) {
    super(id);
  }

  /**
   * Books an entry on an account. A credit-card account only takes card
   * movements, because that is the only way money moves on one.
   */
  static book(
    input: { readonly id: UniqueEntityId; readonly account: BankAccount } & LedgerEntryDraft,
  ): Result<LedgerEntry, SandboxBankError<'INVALID_LEDGER_ENTRY'>> {
    const { id, account, ...draft } = input;
    const transactionName = draft.transactionName.trim().replace(/\s+/g, ' ');

    if (!LedgerEntry.isValid({ ...draft, transactionName }, account)) {
      return fail(SandboxBankError.invalidLedgerEntry());
    }

    return ok(
      new LedgerEntry(id, {
        ...draft,
        transactionName,
        accountId: account.id,
        customerId: account.customerId,
      }),
    );
  }

  static restore(id: UniqueEntityId, properties: LedgerEntryProperties): LedgerEntry {
    return new LedgerEntry(id, properties);
  }

  private static isValid(draft: LedgerEntryDraft, account: BankAccount): boolean {
    return (
      !draft.amount.isZero() &&
      draft.transactionName.length > 0 &&
      draft.transactionName.length <= TRANSACTION_NAME_MAXIMUM_LENGTH &&
      LedgerEntry.isMerchantCategoryCode(draft.merchantCategoryCode) &&
      LedgerEntry.isDocument(draft.payeeDocument) &&
      (!account.isCreditCard() || draft.type === 'CARTAO')
    );
  }

  private static isMerchantCategoryCode(code: number | null): boolean {
    return code === null || (Number.isInteger(code) && code >= 0 && code <= LARGEST_MCC);
  }

  private static isDocument(document: string | null): boolean {
    return (
      document === null ||
      (ONLY_DIGITS.test(document) && DOCUMENT_LENGTHS.includes(document.length))
    );
  }

  get accountId(): UniqueEntityId {
    return this.properties.accountId;
  }

  get customerId(): UniqueEntityId {
    return this.properties.customerId;
  }

  get bookedAt(): Date {
    return this.properties.bookedAt;
  }

  get amount(): Money {
    return this.properties.amount;
  }

  get transactionName(): string {
    return this.properties.transactionName;
  }

  get type(): EntryType {
    return this.properties.type;
  }

  get status(): EntryStatus {
    return this.properties.status;
  }

  get merchantCategoryCode(): number | null {
    return this.properties.merchantCategoryCode;
  }

  get payeeDocument(): string | null {
    return this.properties.payeeDocument;
  }
}
