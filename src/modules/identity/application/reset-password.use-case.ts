import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PasswordHash } from '../domain/password-hash.js';
import type { PasswordResetToken } from '../domain/password-reset-token.js';
import type { PasswordResetTokenRepository } from '../domain/password-reset-token.repository.js';
import { Password } from '../domain/password.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { PasswordChangedOutput, ResetPasswordInput } from './dto/reset-password.dto.js';
import { identityFailures, passwordFailure } from './identity.failures.js';
import type {
  IdentityTransaction,
  IdentityUnitOfWork,
} from './ports/identity-unit-of-work.port.js';
import type { PasswordHasher } from './ports/password-hasher.port.js';
import type { SessionTokenGenerator } from './ports/session-token-generator.port.js';

export interface ResetPasswordDependencies {
  readonly unitOfWork: IdentityUnitOfWork;
  readonly users: UserRepository;
  readonly passwordResetTokens: PasswordResetTokenRepository;
  readonly passwordHasher: PasswordHasher;
  readonly sessionTokens: SessionTokenGenerator;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * Consumes a reset token and sets a new password.
 *
 * The password is checked **before** the token is looked at, so a password that
 * is too short or mistyped leaves the link usable — the person can resubmit
 * rather than having to ask for another e-mail. Unknown, expired, already-used
 * and superseded tokens all answer with one message.
 *
 * No session is issued. A link that both resets and signs in makes an e-mail
 * account a bearer credential for a finance app; the person signs in afterwards
 * with the password they just chose.
 *
 * @see docs/features/login.md
 */
export class ResetPassword implements UseCase<ResetPasswordInput, PasswordChangedOutput> {
  constructor(private readonly dependencies: ResetPasswordDependencies) {}

  async execute(input: ResetPasswordInput): Promise<Result<PasswordChangedOutput, AppError>> {
    const password = Password.create(input.password);

    if (!password.ok) {
      return fail(passwordFailure(password.error.code));
    }

    if (!password.value.matchesConfirmation(input.passwordConfirmation)) {
      return fail(identityFailures.passwordConfirmationMismatch());
    }

    const resetToken = await this.dependencies.passwordResetTokens.findByTokenFingerprint(
      this.dependencies.sessionTokens.fingerprint(input.token),
    );
    const now = this.dependencies.clock.now();

    if (resetToken === null || !resetToken.isUsableAt(now)) {
      return fail(identityFailures.passwordResetTokenInvalid());
    }

    // Argon2id is slow by design and must not hold a transaction open.
    const passwordHash = await this.dependencies.passwordHasher.hash(password.value);

    return await this.change(resetToken, passwordHash, now);
  }

  private async change(
    resetToken: PasswordResetToken,
    passwordHash: PasswordHash,
    now: Date,
  ): Promise<Result<PasswordChangedOutput, AppError>> {
    const user = await this.dependencies.users.findById(resetToken.userId);

    if (user === null) {
      return fail(identityFailures.passwordResetTokenInvalid());
    }

    user.changePassword(passwordHash, now);

    await this.dependencies.unitOfWork.run(async (transaction) => {
      await transaction.users.save(user);
      await this.spendTokens(transaction, resetToken, now);
      await this.revokeSessions(transaction, user.id, now);
    });

    await this.dependencies.events.publish(user.pullEvents());

    return ok({ status: 'PASSWORD_CHANGED' });
  }

  /** The link that was used, and every other one outstanding for this user. */
  private async spendTokens(
    transaction: IdentityTransaction,
    used: PasswordResetToken,
    now: Date,
  ): Promise<void> {
    const outstanding = await transaction.passwordResetTokens.findPendingByUserId(used.userId);
    const others = outstanding.filter((token) => !token.id.equals(used.id));

    for (const token of [used, ...others]) {
      token.consume(now);
      await transaction.passwordResetTokens.save(token);
    }
  }

  /**
   * Every session, including one active on another device: they were all issued
   * against a credential that no longer exists. This is the one place where
   * "signing in revokes nothing" does not apply.
   */
  private async revokeSessions(
    transaction: IdentityTransaction,
    userId: UniqueEntityId,
    now: Date,
  ): Promise<void> {
    const sessions = await transaction.sessions.findActiveByUserId(userId);

    for (const session of sessions) {
      session.revokeAfterPasswordChange(now);
      await transaction.sessions.save(session);
    }
  }
}
