import type { Cnpj } from './cnpj.js';

/**
 * The betting operators this product knows by registration number, resolved
 * once and handed to the policy chain. It is deliberately a snapshot: a
 * reclassification being undone re-reads the chain, so a registry that has
 * gained an operator since yields the current verdict rather than a remembered
 * one.
 */
export class BookmakerRegistry {
  private readonly documents: ReadonlySet<string>;

  private constructor(documents: ReadonlySet<string>) {
    this.documents = documents;
  }

  static of(bookmakerDocuments: readonly Cnpj[]): BookmakerRegistry {
    return new BookmakerRegistry(new Set(bookmakerDocuments.map((document) => document.digits)));
  }

  static empty(): BookmakerRegistry {
    return new BookmakerRegistry(new Set());
  }

  includes(document: Cnpj): boolean {
    return this.documents.has(document.digits);
  }

  get size(): number {
    return this.documents.size;
  }
}
