import { beforeEach, describe, expect, it } from 'vitest';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { BetClassificationOverridden } from '../domain/events/bet-classification-overridden.js';
import { GAMBLING_MCC } from '../domain/policies/gambling-mcc.policy.js';
import { InMemoryBookmakerRegistryReader } from '../infrastructure/in-memory/in-memory-bookmaker-registry-reader.js';
import { InMemoryClassifiedTransactionReader } from '../infrastructure/in-memory/in-memory-classified-transaction-reader.js';
import { InMemoryTransactionClassificationRepository } from '../infrastructure/in-memory/in-memory-transaction-classification.repository.js';
import { ClassifyTransaction } from './classify-transaction.use-case.js';
import { ReclassifyTransaction } from './reclassify-transaction.use-case.js';
import { RevertReclassification } from './revert-reclassification.use-case.js';
import type { YieldCalculator } from './ports/yield-calculator.port.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-000000000001';
const OTHER_USER_ID = '0192f3c1-7a1b-7c3e-9f20-000000000002';
const BET_ID = '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77';
const GROCERY_ID = '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c78';
const NOW = new Date('2026-10-11T12:30:44.001Z');

/** 11,4% a year, the rate `awareness` holds. */
const YIELDS: YieldCalculator = {
  reframe: (amountInCents) => ({
    futureValueInCents: Math.round(Math.abs(amountInCents) * 1.114),
    annualRatePercent: 11.4,
  }),
};

let classifications: InMemoryTransactionClassificationRepository;
let bookmakers: InMemoryBookmakerRegistryReader;
let transactions: InMemoryClassifiedTransactionReader;
let events: RecordingEventPublisher;
let reclassify: ReclassifyTransaction;
let revert: RevertReclassification;

async function classify(transactionId: string, mcc: number): Promise<void> {
  await new ClassifyTransaction({
    classifications,
    bookmakers,
    clock: new FixedClock(NOW),
    events: new RecordingEventPublisher(),
  }).execute({ userId: USER_ID, transactionId, mcc, description: 'PAGAMENTO' });
}

beforeEach(async () => {
  classifications = new InMemoryTransactionClassificationRepository();
  bookmakers = new InMemoryBookmakerRegistryReader();
  transactions = new InMemoryClassifiedTransactionReader();
  events = new RecordingEventPublisher();

  reclassify = new ReclassifyTransaction({
    classifications,
    clock: new FixedClock(NOW),
    events,
  });
  revert = new RevertReclassification({
    classifications,
    bookmakers,
    transactions,
    yields: YIELDS,
    clock: new FixedClock(NOW),
    events,
  });

  await classify(BET_ID, GAMBLING_MCC);
  await classify(GROCERY_ID, 5411);
  transactions.record(BET_ID, USER_ID, -50000);
});

describe('ReclassifyTransaction', () => {
  it('answers with the row stripped of its bet and its reframing', async () => {
    const result = await reclassify.execute({ userId: USER_ID, transactionId: BET_ID });

    expect(result.ok && result.value.transaction).toEqual({
      id: BET_ID,
      bet: null,
      yieldEquivalent: null,
    });
    expect(result.ok && result.value.override).toEqual({
      verdict: 'NOT_A_BET',
      overriddenAt: '2026-10-11T12:30:44.001Z',
      isReversible: true,
    });
  });

  it('emits BetClassificationOverridden once, with no reason text', async () => {
    await reclassify.execute({
      userId: USER_ID,
      transactionId: BET_ID,
      reason: 'É uma transferência para minha mãe',
    });

    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toBeInstanceOf(BetClassificationOverridden);
    expect(JSON.stringify(events.published[0]?.payload)).not.toContain('mãe');
  });

  it('refuses a transaction that was never called a bet', async () => {
    const result = await reclassify.execute({ userId: USER_ID, transactionId: GROCERY_ID });

    expect(!result.ok && result.error.code).toBe('NOT_CLASSIFIED_AS_BET');
    expect(!result.ok && result.error.status).toBe(422);
  });

  it('refuses a second correction', async () => {
    await reclassify.execute({ userId: USER_ID, transactionId: BET_ID });
    const again = await reclassify.execute({ userId: USER_ID, transactionId: BET_ID });

    expect(!again.ok && again.error.code).toBe('ALREADY_OVERRIDDEN');
    expect(!again.ok && again.error.status).toBe(409);
  });

  it('answers another user transaction exactly as a missing one', async () => {
    const theirs = await reclassify.execute({ userId: OTHER_USER_ID, transactionId: BET_ID });
    const missing = await reclassify.execute({
      userId: USER_ID,
      transactionId: '0192f3c1-7a1b-7c3e-9f20-00000000dead',
    });

    expect(!theirs.ok && theirs.error.code).toBe('TRANSACTION_NOT_FOUND');
    expect(!theirs.ok && theirs.error.status).toBe(404);
    expect(!missing.ok && missing.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('never disputes the correction in any message', async () => {
    const result = await reclassify.execute({ userId: USER_ID, transactionId: GROCERY_ID });

    expect(!result.ok && result.error.message).toBe('Essa transação não está marcada como aposta.');
    expect(!result.ok && result.error.message).not.toContain('correta');
  });
});

describe('RevertReclassification', () => {
  it('restores the verdict and the reframing', async () => {
    await reclassify.execute({ userId: USER_ID, transactionId: BET_ID });

    const result = await revert.execute({ userId: USER_ID, transactionId: BET_ID });

    expect(result.ok && result.value.transaction.bet).toEqual({
      matchedBy: 'GAMBLING_MCC',
      confidence: 'HIGH',
      source: 'POLICY',
    });
    expect(result.ok && result.value.transaction.yieldEquivalent).toEqual({
      amountInCents: 55700,
      currency: 'BRL',
    });
    expect(result.ok && result.value.override).toBeNull();
  });

  it('refuses when there is no correction to undo', async () => {
    const result = await revert.execute({ userId: USER_ID, transactionId: BET_ID });

    expect(!result.ok && result.error.code).toBe('OVERRIDE_NOT_FOUND');
    expect(!result.ok && result.error.status).toBe(404);
  });

  it('answers another user transaction as a missing one', async () => {
    await reclassify.execute({ userId: USER_ID, transactionId: BET_ID });

    const result = await revert.execute({ userId: OTHER_USER_ID, transactionId: BET_ID });

    expect(!result.ok && result.error.code).toBe('TRANSACTION_NOT_FOUND');
  });
});
