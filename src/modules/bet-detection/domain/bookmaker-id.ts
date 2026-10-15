import type { CounterpartyKey } from './counterparty-key.js';

const REGISTERED_PREFIX = 'bkm_';
const UNREGISTERED_PREFIX = 'bkm_unregistered_';

/** FNV-1a's 32-bit parameters. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEXADECIMAL = 16;
const DIGITS = 8;

/**
 * A fixed-length digest of the normalised counterparty, so the id of an
 * unregistered house is the same on every request and in every process. It is
 * FNV-1a rather than a hash from `node:crypto` because this is domain code: it
 * has to run with no imports, and a deterministic non-cryptographic digest is
 * exactly what an opaque grouping key needs.
 */
function digestOf(key: string): string {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash.toString(HEXADECIMAL).padStart(DIGITS, '0');
}

/**
 * How a bookmaker is named on the wire. Opaque and stable, and **never** the
 * CNPJ: the registration number is the registry's key and it stays inside this
 * context.
 *
 * Two kinds, because there are two ways to know a house. A registry match is
 * identified by the registry row, so two spellings of one operator collapse
 * into one id. A match on MCC or on a keyword alone has only the counterparty
 * to go by, so its id is derived from the normalised name — which can merge two
 * similarly named houses or split one house's two spellings. That is what
 * `RegistryStatus` exists to report.
 */
export class BookmakerId {
  private constructor(readonly value: string) {}

  static forRegistered(bookmakerId: string): BookmakerId {
    return new BookmakerId(`${REGISTERED_PREFIX}${bookmakerId}`);
  }

  static forUnregistered(counterparty: CounterpartyKey): BookmakerId {
    return new BookmakerId(`${UNREGISTERED_PREFIX}${digestOf(counterparty.value)}`);
  }

  static restore(value: string): BookmakerId {
    return new BookmakerId(value);
  }

  equals(other: BookmakerId): boolean {
    return this.value === other.value;
  }
}
