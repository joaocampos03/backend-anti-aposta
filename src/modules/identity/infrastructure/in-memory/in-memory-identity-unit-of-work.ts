import type {
  IdentityTransaction,
  IdentityUnitOfWork,
} from '../../application/ports/identity-unit-of-work.port.js';
import type { InMemoryPasswordResetTokenRepository } from './in-memory-password-reset-token.repository.js';
import type { InMemorySessionRepository } from './in-memory-session.repository.js';
import type { InMemorySignInThrottleRepository } from './in-memory-sign-in-throttle.repository.js';
import type { InMemoryUserRepository } from './in-memory-user.repository.js';

/**
 * Runs the work against the in-memory repositories. It cannot roll back, so a
 * test that needs to prove "either both aggregates or neither" belongs in the
 * integration suite, against a real Postgres.
 */
export class InMemoryIdentityUnitOfWork implements IdentityUnitOfWork {
  constructor(
    private readonly users: InMemoryUserRepository,
    private readonly sessions: InMemorySessionRepository,
    private readonly signInThrottles: InMemorySignInThrottleRepository,
    private readonly passwordResetTokens: InMemoryPasswordResetTokenRepository,
  ) {}

  async run<TResult>(
    work: (transaction: IdentityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return await work({
      users: this.users,
      sessions: this.sessions,
      signInThrottles: this.signInThrottles,
      passwordResetTokens: this.passwordResetTokens,
    });
  }
}
