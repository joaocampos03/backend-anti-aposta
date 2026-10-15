import { describe, expect, it } from 'vitest';
import { CounterpartyKey } from './counterparty-key.js';

describe('CounterpartyKey', () => {
  it('folds case so one house is not two', () => {
    expect(CounterpartyKey.of('Betano').value).toBe(CounterpartyKey.of('BETANO').value);
  });

  it('strips accents, which banks print inconsistently', () => {
    expect(CounterpartyKey.of('Esportes da Sorte').value).toBe(
      CounterpartyKey.of('ESPÓRTES DA SÓRTE').value,
    );
  });

  it('drops the acquirer tag after the asterisk', () => {
    expect(CounterpartyKey.of('BETANO*PIX').value).toBe(CounterpartyKey.of('Betano').value);
  });

  it('drops the payment-processor words the bank wraps a name in', () => {
    expect(CounterpartyKey.of('PIX ENVIADO Esportes da Sorte').value).toBe(
      CounterpartyKey.of('Esportes da Sorte').value,
    );
  });

  it('keeps a word that merely contains a processor name', () => {
    expect(CounterpartyKey.of('PAGBET').value).toBe('PAGBET');
  });

  it('does not merge two houses that share a word', () => {
    expect(CounterpartyKey.of('Sorte Online').value).not.toBe(
      CounterpartyKey.of('Esportes da Sorte').value,
    );
  });

  it('answers empty for a line with nothing nameable in it', () => {
    expect(CounterpartyKey.of('  *** ').isEmpty).toBe(true);
  });
});
