import { describe, expect, it } from 'vitest';
import { BookmakerRegistry } from './bookmaker-registry.js';
import { Cnpj } from './cnpj.js';
import { DetectionPolicyChain } from './detection-policy-chain.js';
import { DetectionSignals } from './detection-signals.js';
import { GAMBLING_MCC } from './policies/gambling-mcc.policy.js';

const BOOKMAKER_DOCUMENT = '12345678000199';

function aCnpj(digits: string): Cnpj {
  const document = Cnpj.create(digits);

  if (!document.ok) {
    throw new Error('fixture is invalid');
  }

  return document.value;
}

const CHAIN = DetectionPolicyChain.standard(
  BookmakerRegistry.of([aCnpj(BOOKMAKER_DOCUMENT)]),
);

describe('DetectionPolicyChain', () => {
  it('says nothing about an ordinary purchase', () => {
    const verdict = CHAIN.classify(
      DetectionSignals.of({ mcc: 5411, description: 'SUPERMERCADO PAO DE ACUCAR' }),
    );

    expect(verdict).toBeNull();
  });

  describe('the gambling MCC', () => {
    it('is a confident match on its own', () => {
      const verdict = CHAIN.classify(
        DetectionSignals.of({ mcc: GAMBLING_MCC, description: 'PAGAMENTO' }),
      );

      expect(verdict?.matchedBy).toBe('GAMBLING_MCC');
      expect(verdict?.confidence).toBe('HIGH');
      expect(verdict?.source).toBe('POLICY');
    });
  });

  describe('the bookmaker registry', () => {
    it('matches a known operator by its document', () => {
      const verdict = CHAIN.classify(
        DetectionSignals.of({
          counterpartyDocument: aCnpj(BOOKMAKER_DOCUMENT),
          description: 'PIX ENVIADO',
        }),
      );

      expect(verdict?.matchedBy).toBe('LICENSED_CNPJ');
      expect(verdict?.confidence).toBe('MEDIUM');
    });

    it('says nothing about an operator it has not been told about', () => {
      const verdict = CHAIN.classify(
        DetectionSignals.of({
          counterpartyDocument: aCnpj('99999999000100'),
          description: 'PIX ENVIADO',
        }),
      );

      expect(verdict).toBeNull();
    });
  });

  describe('the description keyword', () => {
    it('is never more than a low-confidence match', () => {
      const verdict = CHAIN.classify(DetectionSignals.of({ description: 'PIX APOSTA ESPORTIVA' }));

      expect(verdict?.matchedBy).toBe('DESCRIPTION_KEYWORD');
      expect(verdict?.confidence).toBe('LOW');
    });

    it('folds accents, because a statement line rarely carries them', () => {
      expect(CHAIN.classify(DetectionSignals.of({ description: 'CASSINO ONLINE' }))).not.toBeNull();
      expect(CHAIN.classify(DetectionSignals.of({ description: 'LOTERIA FEDERAL' }))).not.toBeNull();
    });

    it('matches whole words only, so a name that contains one is left alone', () => {
      expect(CHAIN.classify(DetectionSignals.of({ description: 'PADARIA BETANIA' }))).toBeNull();
      expect(CHAIN.classify(DetectionSignals.of({ description: 'MOVEIS ABETO' }))).toBeNull();
    });
  });

  describe('when more than one policy agrees', () => {
    it('reports the strongest reason and the lowest confidence', () => {
      const verdict = CHAIN.classify(
        DetectionSignals.of({ mcc: GAMBLING_MCC, description: 'BET365 APOSTA' }),
      );

      expect(verdict?.matchedBy).toBe('GAMBLING_MCC');
      expect(verdict?.confidence).toBe('LOW');
    });

    it('keeps a medium match medium when the weaker one does not apply', () => {
      const verdict = CHAIN.classify(
        DetectionSignals.of({
          counterpartyDocument: aCnpj(BOOKMAKER_DOCUMENT),
          mcc: GAMBLING_MCC,
          description: 'PAGAMENTO',
        }),
      );

      expect(verdict?.matchedBy).toBe('GAMBLING_MCC');
      expect(verdict?.confidence).toBe('MEDIUM');
    });
  });
});
