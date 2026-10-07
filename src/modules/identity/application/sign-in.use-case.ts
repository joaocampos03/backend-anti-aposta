import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { assertNever } from '@shared/domain/assert-never.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { Email } from '../domain/email.js';
import type { IdentityDomainErrorCode } from '../domain/identity.errors.js';
import type { PasswordVerifier } from '../domain/password-verifier.js';
import { Password } from '../domain/password.js';
import { Session } from '../domain/session.js';
import type { SignInThrottle } from '../domain/sign-in-throttle.js';
import type { SignInThrottleRepository } from '../domain/sign-in-throttle.repository.js';
import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { SignedInOutput, SignInInput } from './dto/sign-in.dto.js';
import { identityFailures } from './identity.failures.js';
import { IDENTITY_FIELD_MESSAGES, IDENTITY_MESSAGES } from './identity.messages.js';
import type { AuthorisedConsentLookup } from './ports/authorised-consent-lookup.port.js';
import type { IdentityUnitOfWork } from './ports/identity-unit-of-work.port.js';
import type { SessionTokenGenerator } from './ports/session-token-generator.port.js';

export interface SignInDependencies {
  readonly unitOfWork: IdentityUnitOfWork;
  readonly users: UserRepository;
  readonly signInThrottles: SignInThrottleRepository;
  readonly passwordVerifier: PasswordVerifier;
  readonly sessionTokens: SessionTokenGenerator;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly events: EventPublisher;
  readonly openFinanceConsents: AuthorisedConsentLookup;
  readonly sessionLifetimeInDays: number;
}

interface Attempt {
  readonly email: Email;
  readonly password: Password;
}

type AttemptErrorCode = Extract<
  IdentityDomainErrorCode,
  'PASSWORD_MISSING' | 'PASSWORD_TOO_LONG'
>;

/**
 * Verifies the pair and issues a session.
 *
 * Three rules shape this use case, all of them from the ethics section rather
 * than from convenience:
 *
 * - **One undifferentiated failure.** A wrong password, an unknown address, a
 *   deleted account and one pending purge all leave by the same return, so no
 *   branch exists that could ever diverge into a clearer message.
 * - **Constant time with respect to account existence.** An address with no
 *   account still spends a hash against a decoy, so timing cannot be used to
 *   enumerate users.
 * - **The throttle delays, it never denies.** It is checked before the
 *   credential, so a 429 reveals nothing about the account — including whether
 *   it exists — and no number of failures produces a state in which the correct
 *   password stays refused.
 *
 * @see docs/features/login.md
 */
export class SignIn implements UseCase<SignInInput, SignedInOutput> {
  constructor(private readonly dependencies: SignInDependencies) {}

  async execute(input: SignInInput): Promise<Result<SignedInOutput, AppError>> {
    const attempt = this.accept(input);

    if (!attempt.ok) {
      return attempt;
    }

    const { email, password } = attempt.value;
    const now = this.dependencies.clock.now();
    const throttle = await this.dependencies.signInThrottles.findByEmail(email);

    if (throttle.isDelayedAt(now)) {
      return fail(identityFailures.tooManyAttempts(throttle.retryAfterSecondsAt(now)));
    }

    const user = await this.dependencies.users.findByEmail(email);

    if (user === null) {
      await this.dependencies.passwordVerifier.verifyAgainstDecoy(password);

      return await this.refuse(throttle, now);
    }

    if (!(await user.credential.verify(password, this.dependencies.passwordVerifier))) {
      return await this.refuse(throttle, now);
    }

    return ok(await this.issueSession(user, throttle, now));
  }

  private accept(input: SignInInput): Result<Attempt, AppError> {
    const email = Email.create(input.email);
    const password = Password.attempt(input.password);
    const fieldErrors: Record<string, string> = {};

    if (!email.ok) {
      fieldErrors['email'] = IDENTITY_FIELD_MESSAGES.email;
    }

    if (!password.ok) {
      fieldErrors['password'] = this.messageFor(password.error.code);
    }

    if (!email.ok || !password.ok) {
      return fail(identityFailures.validationFailed(fieldErrors));
    }

    return ok({ email: email.value, password: password.value });
  }

  private messageFor(code: AttemptErrorCode): string {
    switch (code) {
      case 'PASSWORD_MISSING':
        return IDENTITY_FIELD_MESSAGES.passwordMissing;
      case 'PASSWORD_TOO_LONG':
        return IDENTITY_MESSAGES.passwordTooLong;
      default:
        return assertNever(code);
    }
  }

  /** The single exit for every credential failure, whatever caused it. */
  private async refuse(
    throttle: SignInThrottle,
    now: Date,
  ): Promise<Result<SignedInOutput, AppError>> {
    await this.dependencies.signInThrottles.save(throttle.afterFailure(now));

    return fail(identityFailures.invalidCredentials());
  }

  private async issueSession(
    user: User,
    throttle: SignInThrottle,
    now: Date,
  ): Promise<SignedInOutput> {
    const token = this.dependencies.sessionTokens.generate();
    const session = Session.issueOnSignIn({
      id: this.dependencies.idGenerator.generate(),
      userId: user.id,
      tokenFingerprint: this.dependencies.sessionTokens.fingerprint(token),
      issuedAt: now,
      lifetimeInDays: this.dependencies.sessionLifetimeInDays,
    });

    await this.dependencies.unitOfWork.run(async (transaction) => {
      await transaction.sessions.save(session);
      // A success clears the window: the failures were somebody typing, not an
      // attack, and the next mistake starts from zero.
      await transaction.signInThrottles.save(throttle.cleared());
    });

    await this.dependencies.events.publish(session.pullEvents());

    const hasAuthorisedConsent = await this.dependencies.openFinanceConsents.hasAuthorisedConsent(
      user.id.value,
    );

    return {
      user: {
        id: user.id.value,
        name: user.displayName.value,
        email: user.email.value,
      },
      session: {
        token,
        expiresAt: session.expiresAt.toISOString(),
      },
      openFinance: { hasAuthorisedConsent },
    };
  }
}
