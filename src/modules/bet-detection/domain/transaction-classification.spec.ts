import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BookmakerRegistry, type BookmakerRegistryEntry } from './bookmaker-registry.js';
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

const REGISTERED_BOOKMAKER: BookmakerRegistryEntry = {
  id: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000009'),
  tradeName: 'Aposta Andorinha',
  document: aCnpj(BOOKMAKER_DOCUMENT),
};

const EMPTY_REGISTRY = BookmakerRegistry.empty();
const REGISTRY_WITH_BOOKMAKER = BookmakerRegistry.of([REGISTERED_BOOKMAKER]);

const EMPTY_DETECTION = {
  chain: DetectionPolicyChain.standard(EMPTY_REGISTRY),
  registry: EMPTY_REGISTRY,
};

const DETECTION_WITH_BOOKMAKER = {
  chain: DetectionPolicyChain.standard(REGISTRY_WITH_BOOKMAKER),
  registry: REGISTRY_WITH_BOOKMAKER,
};

function aBet(): TransactionClassification {
  return TransactionClassification.classify({
    transactionId: TRANSACTION_ID,
    userId: USER_ID,
    signals: DetectionSignals.of({ mcc: GAMBLING_MCC, description: 'BET365' }),
    counterparty: 'Bet365',
    detection: EMPTY_DETECTION,
    classifiedAt: CLASSIFIED_AT,
  });
}

function aGroceryRun(): TransactionClassification {
  return TransactionClassification.classify({
    transactionId: TRANSACTION_ID,
    userId: USER_ID,
    signals: DetectionSignals.of({ mcc: 5411, description: 'SUPERMERCADO' }),
    counterparty: 'Supermercado Pão de Açúcar',
    detection: EMPTY_DETECTION,
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

      classification.reclassify(EMPTY_DETECTION, LATER);

      expect(classification.isBet).toBe(false);
      expect(classification.policyVerdict?.matchedBy).toBe('GAMBLING_MCC');
    });
  });

  describe('undoing a correction', () => {
    it('restores the verdict by re-reading the chain', () => {
      const classification = aBet();
      classification.overrideAsNotABet({ reason: null, overriddenAt: LATER });
      classification.pullEvents();

      const reverted = classification.revertOverride({ detection: EMPTY_DETECTION, revertedAt: LATER });

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
        counterparty: 'PIX ENVIADO',
        detection: EMPTY_DETECTION,
        classifiedAt: CLASSIFIED_AT,
      });

      // The chain said nothing, so there is nothing to correct yet; the registry
      // gains the operator and a re-run finds it.
      expect(byDocumentOnly.isBet).toBe(false);
      byDocumentOnly.reclassify(DETECTION_WITH_BOOKMAKER, LATER);

      expect(byDocumentOnly.isBet).toBe(true);
      expect(byDocumentOnly.policyVerdict?.matchedBy).toBe('LICENSED_CNPJ');
    });

    it('refuses when there is no correction to undo', () => {
      const result = aBet().revertOverride({ detection: EMPTY_DETECTION, revertedAt: LATER });

      expect(!result.ok && result.error.code).toBe('OVERRIDE_NOT_FOUND');
    });
  });

  describe('attributing a bookmaker', () => {
    it('attributes nothing to a transaction nobody called a bet', () => {
      expect(aGroceryRun().bookmaker).toBeNull();
    });

    it('names an unregistered house after its counterparty', () => {
      const bookmaker = aBet().bookmaker;

      expect(bookmaker?.registryStatus).toBe('UNREGISTERED');
      expect(bookmaker?.name).toBe('Bet365');
    });

    it('takes the registry name once the operator is registered', () => {
      const classification = TransactionClassification.classify({
        transactionId: TRANSACTION_ID,
        userId: USER_ID,
        signals: DetectionSignals.of({
          counterpartyDocument: aCnpj(BOOKMAKER_DOCUMENT),
          description: 'PIX ENVIADO',
        }),
        counterparty: 'PIX ENVIADO',
        detection: DETECTION_WITH_BOOKMAKER,
        classifiedAt: CLASSIFIED_AT,
      });

      expect(classification.bookmaker?.registryStatus).toBe('REGISTERED');
      expect(classification.bookmaker?.name).toBe('Aposta Andorinha');
    });

    it('re-resolves the attribution when the registry has gained the operator', () => {
      const classification = TransactionClassification.classify({
        transactionId: TRANSACTION_ID,
        userId: USER_ID,
        signals: DetectionSignals.of({
          mcc: GAMBLING_MCC,
          counterpartyDocument: aCnpj(BOOKMAKER_DOCUMENT),
          description: 'ANDORINHA*PIX',
        }),
        counterparty: 'ANDORINHA*PIX',
        detection: EMPTY_DETECTION,
        classifiedAt: CLASSIFIED_AT,
      });

      expect(classification.bookmaker?.registryStatus).toBe('UNREGISTERED');

      classification.reclassify(DETECTION_WITH_BOOKMAKER, LATER);

      expect(classification.bookmaker?.registryStatus).toBe('REGISTERED');
      expect(classification.bookmaker?.name).toBe('Aposta Andorinha');
    });

    it('keeps a corrected row out of every bookmaker figure', () => {
      const classification = aBet();
      classification.overrideAsNotABet({ reason: null, overriddenAt: LATER });

      expect(classification.bookmaker).not.toBeNull();
      expect(classification.effectiveBookmaker).toBeNull();
    });
  });
});
