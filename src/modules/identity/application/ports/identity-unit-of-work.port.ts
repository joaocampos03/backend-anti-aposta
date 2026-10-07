import type { PasswordResetTokenRepository } from '../../domain/password-reset-token.repository.js';
import type { SessionRepository } from '../../domain/session.repository.js';
import type { SignInThrottleRepository } from '../../domain/sign-in-throttle.repository.js';
import type { UserRepository } from '../../domain/user.repository.js';

export interface IdentityTransaction {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly signInThrottles: SignInThrottleRepository;
  readonly passwordResetTokens: PasswordResetTokenRepository;
}

/**
 * Registration writes two aggregates and a password reset writes several, so
 * each is one transaction: all of it or none. The transaction is opened in
 * `infrastructure/`; a use case never calls `prisma.$transaction`.
 */
export interface IdentityUnitOfWork {
  run<TResult>(work: (transaction: IdentityTransaction) => Promise<TResult>): Promise<TResult>;
}
