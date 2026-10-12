import type { BookmakerRegistryReader } from '../../application/ports/bookmaker-registry-reader.port.js';
import { BookmakerRegistry } from '../../domain/bookmaker-registry.js';
import type { Cnpj } from '../../domain/cnpj.js';

export class InMemoryBookmakerRegistryReader implements BookmakerRegistryReader {
  private documents: readonly Cnpj[] = [];

  /** Arrange: the registry as it stands when the chain next runs. */
  register(...documents: readonly Cnpj[]): void {
    this.documents = [...this.documents, ...documents];
  }

  async current(): Promise<BookmakerRegistry> {
    return BookmakerRegistry.of(this.documents);
  }
}
