import argon2 from 'argon2';
import type { PasswordHasher } from '../application/ports/password-hasher.port.js';
import { PasswordHash } from '../domain/password-hash.js';
import type { PasswordVerifier } from '../domain/password-verifier.js';
import type { Password } from '../domain/password.js';

/** OWASP's Argon2id baseline: 19 MiB of memory, two passes, one lane. */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const DECOY_SECRET_BYTE_LENGTH = 32;

export class Argon2PasswordHasher implements PasswordHasher, PasswordVerifier {
  /**
   * Hashed once, lazily, from a value nobody knows. Verifying against it costs
   * what verifying a real credential costs, which is the whole point.
   */
  private decoyHash: Promise<string> | null = null;

  async hash(password: Password): Promise<PasswordHash> {
    return PasswordHash.restore(await argon2.hash(password.reveal(), ARGON2_OPTIONS));
  }

  async verify(passwordHash: PasswordHash, attempt: Password): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash.value, attempt.reveal());
    } catch {
      // A stored hash Argon2 cannot parse is a corrupted row, not a sign-in
      // failure worth distinguishing: the caller gets the same "no" either way.
      return false;
    }
  }

  async verifyAgainstDecoy(attempt: Password): Promise<boolean> {
    return await this.verify(PasswordHash.restore(await this.decoy()), attempt);
  }

  private async decoy(): Promise<string> {
    this.decoyHash ??= argon2.hash(
      Buffer.from(crypto.getRandomValues(new Uint8Array(DECOY_SECRET_BYTE_LENGTH))).toString('hex'),
      ARGON2_OPTIONS,
    );

    return await this.decoyHash;
  }
}
