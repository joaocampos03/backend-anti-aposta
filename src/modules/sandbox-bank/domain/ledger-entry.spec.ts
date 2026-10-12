import { describe, expect, it } from 'vitest';
import { Money } from '@shared/domain/money.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { anAccount, anEntryDraft } from '../testing/sandbox-bank.builders.js';
import { LedgerEntry, type LedgerEntryDraft } from './ledger-entry.js';

const ENTRY_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77');

function book(overrides: Partial<LedgerEntryDraft> = {}, account = anAccount()) {
  return LedgerEntry.book({ id: ENTRY_ID, account, ...anEntryDraft(overrides) });
}

describe('LedgerEntry', () => {
  it('books a movement on the account and on its owner', () => {
    const account = anAccount();
    const booked = book({}, account);

    expect(booked.ok && booked.value.accountId).toEqual(account.id);
    expect(booked.ok && booked.value.customerId).toEqual(account.customerId);
  });

  it('keeps the statement line as printed, apart from stray whitespace', () => {
    const booked = book({ transactionName: '  PIX   ENVIADO  ' });

    expect(booked.ok && booked.value.transactionName).toBe('PIX ENVIADO');
  });

  it('refuses a movement of nothing', () => {
    const refused = book({ amount: Money.zero() });

    expect(!refused.ok && refused.error.code).toBe('INVALID_LEDGER_ENTRY');
  });

  it('refuses an empty statement line', () => {
    expect(book({ transactionName: '   ' }).ok).toBe(false);
  });

  it('refuses an MCC that is not a four-digit code', () => {
    expect(book({ merchantCategoryCode: 10000 }).ok).toBe(false);
    expect(book({ merchantCategoryCode: 7995 }).ok).toBe(true);
  });

  it('takes a CPF or a CNPJ as the counterparty document, and nothing else', () => {
    expect(book({ payeeDocument: '11222333000181' }).ok).toBe(true);
    expect(book({ payeeDocument: '12345678901' }).ok).toBe(true);
    expect(book({ payeeDocument: '11.222.333/0001-81' }).ok).toBe(false);
  });

  it('accepts only card movements on a credit-card account', () => {
    const card = anAccount({ type: 'CARTAO_CREDITO' });

    expect(book({ type: 'PIX' }, card).ok).toBe(false);
    expect(book({ type: 'CARTAO' }, card).ok).toBe(true);
  });
});
