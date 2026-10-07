import type { PasswordHash } from '../../domain/password-hash.js';
import type { Password } from '../../domain/password.js';

/** Argon2id lives behind this port; the domain never hashes and never compares. */
export interface PasswordHasher {
  hash(password: Password): Promise<PasswordHash>;
}
