import type { PasswordHash } from '../../domain/password-hash.js';
import type { PasswordVerifier } from '../../domain/password-verifier.js';
import type { Password } from '../../domain/password.js';

/**
 * Mirrors `InMemoryPasswordHasher`: a hash is the plaintext with a prefix.
 * Argon2id takes tens of milliseconds by design, which is right in production
 * and wrong in a unit test; the real adapter is covered by the integration suite.
 */
export class InMemoryPasswordVerifier implements PasswordVerifier {
  /** Counts the decoy verifications, so a test can prove they happened. */
  decoyVerifications = 0;

  async verify(passwordHash: PasswordHash, attempt: Password): Promise<boolean> {
    return passwordHash.value === `hashed:${attempt.reveal()}`;
  }

  async verifyAgainstDecoy(_attempt: Password): Promise<boolean> {
    this.decoyVerifications += 1;

    return false;
  }
}
