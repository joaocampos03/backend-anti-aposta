import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  ClientRegistry,
  RegisteredClient,
} from '../application/ports/client-registry.port.js';

/**
 * The one DataRecipient enrolled at the sandbox, configured from the
 * environment. Secrets are compared as SHA-256 digests with `timingSafeEqual`,
 * so the comparison takes the same time whatever the input's length or prefix.
 */
export class ConfiguredClientRegistry implements ClientRegistry {
  private readonly secretDigest: Buffer;

  constructor(
    private readonly client: RegisteredClient,
    clientSecret: string,
  ) {
    this.secretDigest = digestOf(clientSecret);
  }

  authenticate(clientId: string, clientSecret: string): RegisteredClient | null {
    const secretMatches = timingSafeEqual(digestOf(clientSecret), this.secretDigest);

    return secretMatches && clientId === this.client.clientId ? this.client : null;
  }

  findById(clientId: string): RegisteredClient | null {
    return clientId === this.client.clientId ? this.client : null;
  }
}

function digestOf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
