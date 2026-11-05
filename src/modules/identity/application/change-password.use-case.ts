import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Password } from '../domain/password.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { CurrentPasswordCheck } from './current-password-check.js';
import type { ChangePasswordInput } from './dto/account.dto.js';
import { identityFailures, passwordFailure } from './identity.failures.js';
import type { IdentityUnitOfWork } from './ports/identity-unit-of-work.port.js';
import type { PasswordHasher } from './ports/password-hasher.port.js';
import type { SessionTokenGenerator } from './ports/session-token-generator.port.js';

export interface ChangePasswordDependencies {
  readonly unitOfWork: IdentityUnitOfWork;
  readonly users: UserRepository;
  readonly currentPassword: CurrentPasswordCheck;
  readonly passwordHasher: PasswordHasher;
  readonly sessionTokens: SessionTokenGenerator;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * Changing the password from inside the app. Every other session ends, which is
 * the usual reason for doing this, but the one making the change stays: unlike a
 * reset link, this caller has just proved who they are.
 */
export class ChangePassword implements UseCase<ChangePasswordInput, void> {
  constructor(private readonly dependencies: ChangePasswordDependencies) {}

  async execute(input: ChangePasswordInput): Promise<Result<void, AppError>> {
    const password = Password.create(input.password);

    if (!password.ok) {
      return fail(passwordFailure(password.error.code));
    }

    if (!password.value.matchesConfirmation(input.passwordConfirmation)) {
      return fail(identityFailures.passwordConfirmationMismatch());
    }

    const user = await this.dependencies.users.findById(UniqueEntityId.restore(input.userId));

    if (user === null) {
      return fail(identityFailures.sessionInvalid());
    }

    const confirmed = await this.dependencies.currentPassword.confirm(user, input.currentPassword);

    if (!confirmed.ok) {
      return confirmed;
    }

    // Argon2id is slow by design and must not hold a transaction open.
    const passwordHash = await this.dependencies.passwordHasher.hash(password.value);
    const now = this.dependencies.clock.now();
    const keptFingerprint = this.dependencies.sessionTokens.fingerprint(input.token);

    user.changePassword(passwordHash, now);

    await this.dependencies.unitOfWork.run(async (transaction) => {
      await transaction.users.save(user);

      const sessions = await transaction.sessions.findActiveByUserId(user.id);

      for (const session of sessions) {
        if (session.tokenFingerprint !== keptFingerprint) {
          session.revokeAfterPasswordChange(now);
          await transaction.sessions.save(session);
        }
      }
    });

    await this.dependencies.events.publish(user.pullEvents());

    return ok(undefined);
  }
}
