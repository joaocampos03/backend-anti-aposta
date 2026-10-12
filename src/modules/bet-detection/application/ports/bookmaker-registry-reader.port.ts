import type { BookmakerRegistry } from '../../domain/bookmaker-registry.js';

/** Resolves the registry the policy chain runs against, as it stands right now. */
export interface BookmakerRegistryReader {
  current(): Promise<BookmakerRegistry>;
}
