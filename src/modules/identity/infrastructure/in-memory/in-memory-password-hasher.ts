import type { PasswordHasher } from '../../application/ports/password-hasher.port.js';
import { PasswordHash } from '../../domain/password-hash.js';
import type { Password } from '../../domain/password.js';

/**
 * Argon2id takes tens of milliseconds by design, which is right in production
 * and wrong in a unit test. The real hasher is covered by the integration suite.
 */
export class InMemoryPasswordHasher implements PasswordHasher {
  async hash(password: Password): Promise<PasswordHash> {
    return PasswordHash.restore(`hashed:${password.reveal()}`);
  }
}
