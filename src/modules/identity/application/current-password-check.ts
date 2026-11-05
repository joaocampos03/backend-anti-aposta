import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { PasswordVerifier } from '../domain/password-verifier.js';
import { Password } from '../domain/password.js';
import type { SignInThrottleRepository } from '../domain/sign-in-throttle.repository.js';
import type { User } from '../domain/user.js';
import { identityFailures } from './identity.failures.js';

export interface CurrentPasswordCheckDependencies {
  readonly signInThrottles: SignInThrottleRepository;
  readonly passwordVerifier: PasswordVerifier;
  readonly clock: Clock;
}

/**
 * Asks for the password again before anything a stolen session must not be able
 * to do: changing the address, changing the password, deleting the account.
 *
 * It shares the sign-in throttle, on purpose: otherwise a stolen session would be
 * an unthrottled way to guess the password. It delays and never denies, like
 * sign-in, and uses `Password.attempt`, so a password set before the length rule
 * still works. Shared by the three use cases, so none of them calls another.
 */
export class CurrentPasswordCheck {
  constructor(private readonly dependencies: CurrentPasswordCheckDependencies) {}

  async confirm(user: User, attempt: string): Promise<Result<void, AppError>> {
    const password = Password.attempt(attempt);

    if (!password.ok) {
      return fail(identityFailures.currentPasswordInvalid());
    }

    const now = this.dependencies.clock.now();
    const throttle = await this.dependencies.signInThrottles.findByEmail(user.email);

    if (throttle.isDelayedAt(now)) {
      return fail(identityFailures.tooManyAttempts(throttle.retryAfterSecondsAt(now)));
    }

    if (!(await user.credential.verify(password.value, this.dependencies.passwordVerifier))) {
      await this.dependencies.signInThrottles.save(throttle.afterFailure(now));

      return fail(identityFailures.currentPasswordInvalid());
    }

    await this.dependencies.signInThrottles.save(throttle.cleared());

    return ok(undefined);
  }
}
