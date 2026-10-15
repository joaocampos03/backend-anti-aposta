import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BookmakerIdentity } from './bookmaker-identity.js';
import { BookmakerRegistry, type BookmakerRegistryEntry } from './bookmaker-registry.js';
import { Cnpj } from './cnpj.js';

const REGISTERED_DOCUMENT = '12345678000199';
const UNKNOWN_DOCUMENT = '98765432000188';

function aCnpj(digits: string): Cnpj {
  const document = Cnpj.create(digits);

  if (!document.ok) {
    throw new Error('fixture is invalid');
  }

  return document.value;
}

const ANDORINHA: BookmakerRegistryEntry = {
  id: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000009'),
  tradeName: 'Aposta Andorinha',
  document: aCnpj(REGISTERED_DOCUMENT),
};

const REGISTRY = BookmakerRegistry.of([ANDORINHA]);

function resolve(counterparty: string, document: string | null): BookmakerIdentity {
  return BookmakerIdentity.resolve({
    counterparty,
    counterpartyDocument: document === null ? null : aCnpj(document),
    registry: REGISTRY,
  });
}

describe('BookmakerIdentity', () => {
  describe('a registered operator', () => {
    it('is identified by the registry row and named by the registry', () => {
      const identity = resolve('PIX ENVIADO', REGISTERED_DOCUMENT);

      expect(identity.registryStatus).toBe('REGISTERED');
      expect(identity.name).toBe('Aposta Andorinha');
      expect(identity.bookmakerId.value).toBe(`bkm_${ANDORINHA.id.value}`);
    });

    it('collapses two spellings of one registration number into one house', () => {
      const first = resolve('ANDORINHA', REGISTERED_DOCUMENT);
      const second = resolve('Andorinha*Pix', REGISTERED_DOCUMENT);

      expect(first.bookmakerId.equals(second.bookmakerId)).toBe(true);
      expect(second.name).toBe('Aposta Andorinha');
    });

    it('never puts the registration number in the id', () => {
      expect(resolve('PIX ENVIADO', REGISTERED_DOCUMENT).bookmakerId.value).not.toContain(
        REGISTERED_DOCUMENT,
      );
    });
  });

  describe('an operator the registry does not know', () => {
    it('is grouped by the normalised counterparty and named after it', () => {
      const identity = resolve('Esportes da Sorte', null);

      expect(identity.registryStatus).toBe('UNREGISTERED');
      expect(identity.name).toBe('Esportes da Sorte');
      expect(identity.bookmakerId.value).toMatch(/^bkm_unregistered_[0-9a-f]{8}$/);
    });

    it('gives the same id to the same house on every request', () => {
      expect(resolve('Esportes da Sorte', null).bookmakerId.value).toBe(
        resolve('ESPORTES DA SORTE*PIX', null).bookmakerId.value,
      );
    });

    it('gives different houses different ids', () => {
      expect(resolve('Esportes da Sorte', null).bookmakerId.value).not.toBe(
        resolve('Sorte Online', null).bookmakerId.value,
      );
    });

    it('falls back to the counterparty when the number is not ours', () => {
      const identity = resolve('Casa Nova Bets', UNKNOWN_DOCUMENT);

      expect(identity.registryStatus).toBe('UNREGISTERED');
      expect(identity.name).toBe('Casa Nova Bets');
    });

    it('names a line with nothing nameable in it rather than leaving it blank', () => {
      expect(resolve('   ', null).name).toBe(BookmakerIdentity.unattributed().name);
    });
  });

  it('groups every unattributed row together', () => {
    expect(BookmakerIdentity.unattributed().bookmakerId.value).toBe(
      BookmakerIdentity.unattributed().bookmakerId.value,
    );
  });
});
