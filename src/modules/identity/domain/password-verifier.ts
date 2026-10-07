import type { PasswordHash } from './password-hash.js';
import type { Password } from './password.js';

/**
 * A port, declared here because verifying a credential is domain behaviour even
 * though Argon2id lives in `infrastructure/`. It answers a boolean and nothing
 * more: a caller holding the *reason* a verification failed is a caller one
 * refactor away from leaking it into a message.
 */
export interface PasswordVerifier {
  verify(passwordHash: PasswordHash, attempt: Password): Promise<boolean>;

  /**
   * Spends the same work against a decoy hash and always answers `false`, so an
   * address with no account cannot be told from a wrong password by timing.
   * This is an invariant of sign-in, not an optimisation.
   */
  verifyAgainstDecoy(attempt: Password): Promise<boolean>;
}
