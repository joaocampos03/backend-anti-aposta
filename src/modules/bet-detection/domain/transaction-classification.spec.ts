import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BookmakerRegistry } from './bookmaker-registry.js';
import { Cnpj } from './cnpj.js';
import { DetectionPolicyChain } from './detection-policy-chain.js';
import { DetectionSignals } from './detection-signals.js';
import { BetClassificationOverridden } from './events/bet-classification-overridden.js';
import { BetTransactionDetected } from './events/bet-transaction-detected.js';
import { GAMBLING_MCC } from './policies/gambling-mcc.policy.js';
import { TransactionClassification } from './transaction-classification.js';

const TRANSACTION_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77');
const USER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
const CLASSIFIED_AT = new Date('2026-10-11T00:47:00.000Z');
const LATER = new Date('2026-10-11T12:30:44.001Z');
const BOOKMAKER_DOCUMENT = '12345678000199';

function aCnpj(digits: string): Cnpj {
  const document = Cnpj.create(digits);

  if (!document.ok) {
    throw new Error('fixture is invalid');
  }

  return document.value;
}

const EMPTY_CHAIN = DetectionPolicyChain.standard(BookmakerRegistry.empty());
const CHAIN_WITH_BOOKMAKER = DetectionPolicyChain.standard(
  BookmakerRegistry.of([aCnpj(BOOKMAKER_DOCUMENT)]),
);

function aBet(): TransactionClassification {
  return TransactionClassification.classify({
    transactionId: TRANSACTION_ID,
    userId: USER_ID,
    signals: DetectionSignals.of({ mcc: GAMBLING_MCC, description: 'BET365' }),
    chain: EMPTY_CHAIN,
    classifiedAt: CLASSIFIED_AT,
  });
}

function aGroceryRun(): TransactionClassification {
  return TransactionClassification.classify({
    transactionId: TRANSACTION_ID,
    userId: USER_ID,
    signals: DetectionSignals.of({ mcc: 5411, description: 'SUPERMERCADO' }),
    chain: EMPTY_CHAIN,
    classifiedAt: CLASSIFIED_AT,
  });
}

describe('TransactionClassification', () => {
  describe('classifying', () => {
    it('records BetTransactionDetected for a bet, with ids and no amount', () => {
      const [event] = aBet().pullEvents();

      expect(event).toBeInstanceOf(BetTransactionDetected);
      expect(event?.payload).toEqual({
        userId: USER_ID.value,
        transactionId: TRANSACTION_ID.value,
        matchedBy: 'GAMBLING_MCC',
        // Only the MCC matched: "bet365" is not the word "bet", which is the
        // whole point of the keyword policy matching whole words.
        confidence: 'HIGH',
        detectedAt: '2026-10-11T00:47:00.000Z',
      });
    });

    it('records nothing for an ordinary purchase', () => {
      const classification = aGroceryRun();

      expect(classification.isBet).toBe(false);
      expect(classification.pullEvents()).toHaveLength(0);
    });
  });

  describe('correcting', () => {
    it('stops being a bet, and says so through the effective classification', () => {
      const classification = aBet();
      classification.pullEvents();

      const corrected = classification.overrideAsNotABet({ reason: null, overriddenAt: LATER });

      expect(corrected.ok).toBe(true);
      expect(classification.isBet).toBe(false);
      expect(classification.effectiveClassification).toBeNull();
    });

    it('records BetClassificationOverridden with no reason text', () => {
      const classification = aBet();
      classification.pullEvents();
      classification.overrideAsNotABet({
        reason: 'É uma transferência para minha mãe',
        overriddenAt: LATER,
      });

      const [event] = classification.pullEvents();

      expect(event).toBeInstanceOf(BetClassificationOverridden);
      expect(event?.payload).toEqual({
        userId: USER_ID.value,
        transactionId: TRANSACTION_ID.value,
        verdict: 'NOT_A_BET',
        overriddenAt: '2026-10-11T12:30:44.001Z',
      });
    });

    it('keeps the reason for the precision measurement without showing it to anybody', () => {
      const classification = aBet();
      classification.overrideAsNotABet({ reason: 'minha mãe', overriddenAt: LATER });

      expect(classification.override?.reason).toBe('minha mãe');
    });

    it('refuses to correct a transaction that was never called a bet', () => {
      const result = aGroceryRun().overrideAsNotABet({ reason: null, overriddenAt: LATER });

      expect(!result.ok && result.error.code).toBe('NOT_CLASSIFIED_AS_BET');
    });

    it('refuses a second correction', () => {
      const classification = aBet();
      classification.overrideAsNotABet({ reason: null, overriddenAt: LATER });

      const again = classification.overrideAsNotABet({ reason: null, overriddenAt: LATER });

      expect(!again.ok && again.error.code).toBe('ALREADY_OVERRIDDEN');
    });

    it('survives a re-run of the chain: the correction outranks the policy permanently', () => {
      const classification = aBet();
      classification.overrideAsNotABet({ reason: null, overriddenAt: LATER });

      classification.reclassify(EMPTY_CHAIN, LATER);

      expect(classification.isBet).toBe(false);
      expect(classification.policyVerdict?.matchedBy).toBe('GAMBLING_MCC');
    });
  });

  describe('undoing a correction', () => {
    it('restores the verdict by re-reading the chain', () => {
      const classification = aBet();
      classification.overrideAsNotABet({ reason: null, overriddenAt: LATER });
      classification.pullEvents();

      const reverted = classification.revertOverride({ chain: EMPTY_CHAIN, revertedAt: LATER });

      expect(reverted.ok).toBe(true);
      expect(classification.isBet).toBe(true);
      expect(classification.override).toBeNull();
    });

    it('yields the current verdict when the registry changed in the meantime', () => {
      const byDocumentOnly = TransactionClassification.classify({
        transactionId: TRANSACTION_ID,
        userId: USER_ID,
        signals: DetectionSignals.of({
          counterpartyDocument: aCnpj(BOOKMAKER_DOCUMENT),
          description: 'PIX ENVIADO',
        }),
        chain: EMPTY_CHAIN,
        classifiedAt: CLASSIFIED_AT,
      });

      // The chain said nothing, so there is nothing to correct yet; the registry
      // gains the operator and a re-run finds it.
      expect(byDocumentOnly.isBet).toBe(false);
      byDocumentOnly.reclassify(CHAIN_WITH_BOOKMAKER, LATER);

      expect(byDocumentOnly.isBet).toBe(true);
      expect(byDocumentOnly.policyVerdict?.matchedBy).toBe('LICENSED_CNPJ');
    });

    it('refuses when there is no correction to undo', () => {
      const result = aBet().revertOverride({ chain: EMPTY_CHAIN, revertedAt: LATER });

      expect(!result.ok && result.error.code).toBe('OVERRIDE_NOT_FOUND');
    });
  });
});
