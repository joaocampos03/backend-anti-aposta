import type { BookmakerRegistryReader } from '../../application/ports/bookmaker-registry-reader.port.js';
import {
  BookmakerRegistry,
  type BookmakerRegistryEntry,
} from '../../domain/bookmaker-registry.js';

export class InMemoryBookmakerRegistryReader implements BookmakerRegistryReader {
  private entries: readonly BookmakerRegistryEntry[] = [];

  /** Arrange: the registry as it stands when the chain next runs. */
  register(...bookmakers: readonly BookmakerRegistryEntry[]): void {
    this.entries = [...this.entries, ...bookmakers];
  }

  async current(): Promise<BookmakerRegistry> {
    return BookmakerRegistry.of(this.entries);
  }
}
