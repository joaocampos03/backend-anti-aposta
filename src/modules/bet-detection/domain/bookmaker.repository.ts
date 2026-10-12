import type { Bookmaker } from './bookmaker.js';

export interface BookmakerRepository {
  save(bookmaker: Bookmaker): Promise<void>;
  /** The whole registry: it is small, and the chain needs all of it at once. */
  findAllRegistered(): Promise<readonly Bookmaker[]>;
}
