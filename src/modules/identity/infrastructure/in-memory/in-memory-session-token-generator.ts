import type { SessionTokenGenerator } from '../../application/ports/session-token-generator.port.js';

export class InMemorySessionTokenGenerator implements SessionTokenGenerator {
  private issued = 0;

  generate(): string {
    this.issued += 1;

    return `op_token_${this.issued}`;
  }

  fingerprint(token: string): string {
    return `fingerprint:${token}`;
  }
}
