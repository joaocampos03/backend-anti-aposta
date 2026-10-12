import { describe, expect, it } from 'vitest';
import { Money } from '@shared/domain/money.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Consent, type ConsentStatus } from './consent.js';
import { Counterparty } from './counterparty.js';
import { Transaction } from './transaction.js';

const TRANSACTION_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77');
const ACCOUNT_ID = UniqueEntityId.restore('0192f3b0-1111-7c3e-9f20-aaaaaaaaaaaa');
const USER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
const NOW = new Date('2026-10-11T15:00:00.000Z');

function aConsent(status: ConsentStatus = 'AUTHORISED'): Consent {
  return Consent.restore(UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-00000000c0de'), {
    userId: USER_ID,
    status,
    createdAt: NOW,
    expiresAt: new Date('2027-04-11T15:00:00.000Z'),
    lastSyncedAt: NOW,
  });
}

function ingest(consent: Consent, amountInCents = -50000) {
  return Transaction.ingest({
    id: TRANSACTION_ID,
    consent,
    accountId: ACCOUNT_ID,
    occurredAt: NOW,
    amount: Money.restore(amountInCents),
    counterparty: Counterparty.restore('Bet365'),
    category: 'BETS',
    method: 'PIX',
    status: 'SETTLED',
    ingestedAt: NOW,
  });
}

describe('Transaction', () => {
  it('is refused against a consent that is not authorised', () => {
    const refused = ingest(aConsent('REVOKED'));

    expect(!refused.ok && refused.error.code).toBe('CONSENT_NOT_AUTHORISED');
  });

  it('belongs to the user the consent belongs to', () => {
    const ingested = ingest(aConsent());

    expect(ingested.ok && ingested.value.userId.equals(USER_ID)).toBe(true);
  });

  it('keeps the sign: a debit leaves the account', () => {
    const ingested = ingest(aConsent(), -50000);

    expect(ingested.ok && ingested.value.amount.isDebit()).toBe(true);
  });

  it('arrives unclassified: detection is another context and another step', () => {
    const ingested = ingest(aConsent());

    expect(ingested.ok && ingested.value.isBet).toBe(false);
  });

  it('counts under BETS once classified, whatever it was filed as', () => {
    const ingested = ingest(aConsent());

    if (!ingested.ok) {
      throw new Error('fixture is invalid');
    }

    ingested.value.projectClassification({
      matchedBy: 'GAMBLING_MCC',
      confidence: 'HIGH',
      source: 'POLICY',
    });

    expect(ingested.value.spendBucket).toBe('BETS');
  });

  it('falls back to its own category when a correction clears the mark', () => {
    const ingested = Transaction.ingest({
      id: TRANSACTION_ID,
      consent: aConsent(),
      accountId: ACCOUNT_ID,
      occurredAt: NOW,
      amount: Money.restore(-18740),
      counterparty: Counterparty.restore('Mercado'),
      category: 'GROCERIES',
      method: 'PIX',
      status: 'SETTLED',
      ingestedAt: NOW,
    });

    if (!ingested.ok) {
      throw new Error('fixture is invalid');
    }

    ingested.value.projectClassification({
      matchedBy: 'DESCRIPTION_KEYWORD',
      confidence: 'LOW',
      source: 'POLICY',
    });
    ingested.value.projectClassification(null);

    expect(ingested.value.spendBucket).toBe('GROCERIES');
  });

  it('takes the new amount when a pending entry settles', () => {
    const ingested = ingest(aConsent(), -50000);

    if (!ingested.ok) {
      throw new Error('fixture is invalid');
    }

    ingested.value.settle(Money.restore(-42000));

    expect(ingested.value.amount.amountInCents).toBe(-42000);
    expect(ingested.value.status).toBe('SETTLED');
  });
});
