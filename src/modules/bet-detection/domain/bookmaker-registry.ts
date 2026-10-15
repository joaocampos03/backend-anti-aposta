import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Cnpj } from './cnpj.js';

/**
 * What the registry knows about one operator: enough to decide a verdict and to
 * name the house on a screen, and nothing else.
 */
export interface BookmakerRegistryEntry {
  readonly id: UniqueEntityId;
  readonly tradeName: string;
  readonly document: Cnpj;
}

/**
 * The betting operators this product knows by registration number, resolved
 * once and handed to the policy chain. It is deliberately a snapshot: a
 * reclassification being undone re-reads the chain, so a registry that has
 * gained an operator since yields the current verdict rather than a remembered
 * one.
 *
 * It carries the trade name as well as the number because the same lookup
 * answers both questions the product asks: whether this is a licensed house,
 * and what to call it. Two spellings of one CNPJ are one bookmaker, and the
 * registry's name is the one the reader sees.
 */
export class BookmakerRegistry {
  private constructor(private readonly entries: ReadonlyMap<string, BookmakerRegistryEntry>) {}

  static of(bookmakers: readonly BookmakerRegistryEntry[]): BookmakerRegistry {
    return new BookmakerRegistry(
      new Map(bookmakers.map((bookmaker) => [bookmaker.document.digits, bookmaker])),
    );
  }

  static empty(): BookmakerRegistry {
    return new BookmakerRegistry(new Map());
  }

  includes(document: Cnpj): boolean {
    return this.entries.has(document.digits);
  }

  /** The registered operator behind a number, or `null` when it is not ours. */
  entryFor(document: Cnpj): BookmakerRegistryEntry | null {
    return this.entries.get(document.digits) ?? null;
  }

  get size(): number {
    return this.entries.size;
  }
}
