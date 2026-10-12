import { Money } from '@shared/domain/money.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BankAccount, type AccountType } from '../domain/bank-account.js';
import { Consent, type ConsentStatus } from '../domain/consent.js';
import type { LedgerEntryDraft } from '../domain/ledger-entry.js';

export const CUSTOMER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
export const OTHER_CUSTOMER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000002');
export const CLIENT_ID = 'anti-aposta';
export const NOW = new Date('2026-10-12T15:00:00.000Z');

let issued = 100;

function nextId(): UniqueEntityId {
  issued += 1;

  return UniqueEntityId.restore(`0192f3c1-7a1b-7c3e-9f20-${issued.toString().padStart(12, '0')}`);
}

export function anAccount(
  options: { readonly type?: AccountType; readonly customerId?: UniqueEntityId } = {},
): BankAccount {
  return BankAccount.open({
    id: nextId(),
    customerId: options.customerId ?? CUSTOMER_ID,
    type: options.type ?? 'CONTA_DEPOSITO_A_VISTA',
    brandName: 'Banco Andorinha',
    companyCnpj: '12345678000195',
    compeCode: '999',
    branchCode: '0001',
    number: '00044710',
    checkDigit: '3',
    openedAt: NOW,
  });
}

export function anEntryDraft(overrides: Partial<LedgerEntryDraft> = {}): LedgerEntryDraft {
  return {
    bookedAt: NOW,
    amount: Money.restore(-5000),
    transactionName: 'PIX ENVIADO Aposta Andorinha',
    type: 'PIX',
    status: 'TRANSACAO_EFETIVADA',
    merchantCategoryCode: null,
    payeeDocument: null,
    ...overrides,
  };
}

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

/** A consent in any state, without walking it through the transitions. */
export function aConsent(
  options: {
    readonly status?: ConsentStatus;
    readonly accounts?: readonly BankAccount[];
    readonly expiresAt?: Date;
  } = {},
): Consent {
  const status = options.status ?? 'AWAITING_AUTHORISATION';
  const shared = status === 'AUTHORISED';

  return Consent.restore(nextId(), {
    clientId: CLIENT_ID,
    status,
    permissions: ['ACCOUNTS_READ', 'ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ'],
    customerId: shared ? CUSTOMER_ID : null,
    accountIds: shared ? (options.accounts ?? []).map((account) => account.id) : [],
    createdAt: NOW,
    statusUpdatedAt: NOW,
    expiresAt: options.expiresAt ?? new Date(NOW.getTime() + 180 * MILLISECONDS_IN_A_DAY),
  });
}
