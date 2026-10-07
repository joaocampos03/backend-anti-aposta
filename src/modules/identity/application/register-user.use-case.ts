import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { assertNever } from '@shared/domain/assert-never.js';
import type { DomainEvent } from '@shared/domain/domain-event.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { DisplayName } from '../domain/display-name.js';
import { Email } from '../domain/email.js';
import { EmailCollisionError } from '../domain/identity.errors.js';
import type { IdentityDomainErrorCode } from '../domain/identity.errors.js';
import type { PasswordHash } from '../domain/password-hash.js';
import { Password } from '../domain/password.js';
import { RegistrationConsent } from '../domain/registration-consent.js';
import { Session } from '../domain/session.js';
import { User } from '../domain/user.js';
import type { RegisteredUserOutput, RegisterUserInput } from './dto/register-user.dto.js';
import { identityFailures } from './identity.failures.js';
import { IDENTITY_FIELD_MESSAGES, IDENTITY_MESSAGES } from './identity.messages.js';
import type {
  IdentityTransaction,
  IdentityUnitOfWork,
} from './ports/identity-unit-of-work.port.js';
import type { PasswordHasher } from './ports/password-hasher.port.js';
import type { SessionTokenGenerator } from './ports/session-token-generator.port.js';

export interface RegistrationPolicy {
  readonly consentPolicyVersion: string;
  readonly sessionLifetimeInDays: number;
}

interface AcceptedCredentials {
  readonly displayName: DisplayName;
  readonly email: Email;
  readonly password: Password;
}

interface WrittenRegistration {
  readonly user: User;
  readonly session: Session;
  readonly recorded: readonly DomainEvent[];
}

type PasswordErrorCode = Extract<
  IdentityDomainErrorCode,
  'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG'
>;

/**
 * Creates the account, records the LGPD registration consent and issues a
 * session, in one transaction: it produces both the user and the session, or
 * neither. It grants no financial-data scope — connecting a bank is a separate
 * Open Finance consent, approved later on its own screen.
 *
 * @see docs/features/register.md
 */
export class RegisterUser implements UseCase<RegisterUserInput, RegisteredUserOutput> {
  constructor(
    private readonly unitOfWork: IdentityUnitOfWork,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionTokens: SessionTokenGenerator,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
    private readonly policy: RegistrationPolicy,
  ) {}

  async execute(input: RegisterUserInput): Promise<Result<RegisteredUserOutput, AppError>> {
    // The consent is the first gate: without it the platform has no
    // authorisation to process the name and the e-mail at all.
    if (!input.acceptedRegistrationConsent) {
      return fail(identityFailures.consentRequired());
    }

    const credentials = this.acceptCredentials(input);

    if (!credentials.ok) {
      return credentials;
    }

    if (!credentials.value.password.matchesConfirmation(input.passwordConfirmation)) {
      return fail(identityFailures.passwordConfirmationMismatch());
    }

    // Hashing stays outside the transaction: Argon2id is slow by design and must
    // not hold a database transaction open while it runs.
    const passwordHash = await this.passwordHasher.hash(credentials.value.password);

    return await this.persist(credentials.value, passwordHash);
  }

  private acceptCredentials(input: RegisterUserInput): Result<AcceptedCredentials, AppError> {
    const displayName = DisplayName.create(input.name);
    const email = Email.create(input.email);
    const fieldErrors: Record<string, string> = {};

    if (!displayName.ok) {
      fieldErrors['name'] = IDENTITY_FIELD_MESSAGES.name;
    }

    if (!email.ok) {
      fieldErrors['email'] = IDENTITY_FIELD_MESSAGES.email;
    }

    if (!displayName.ok || !email.ok) {
      return fail(identityFailures.validationFailed(fieldErrors));
    }

    const password = Password.create(input.password);

    if (!password.ok) {
      return fail(this.refusePassword(password.error.code));
    }

    return ok({ displayName: displayName.value, email: email.value, password: password.value });
  }

  /** Length is the only password gate; strength stays advice. */
  private refusePassword(code: PasswordErrorCode): AppError {
    switch (code) {
      case 'PASSWORD_TOO_SHORT':
        return identityFailures.passwordTooShort();
      case 'PASSWORD_TOO_LONG':
        return identityFailures.validationFailed({ password: IDENTITY_MESSAGES.passwordTooLong });
      default:
        return assertNever(code);
    }
  }

  private async persist(
    credentials: AcceptedCredentials,
    passwordHash: PasswordHash,
  ): Promise<Result<RegisteredUserOutput, AppError>> {
    const token = this.sessionTokens.generate();

    try {
      const written = await this.unitOfWork.run(async (transaction) =>
        this.write(transaction, credentials, passwordHash, token),
      );

      if (!written.ok) {
        return written;
      }

      return ok(await this.announce(written.value, token));
    } catch (cause) {
      if (cause instanceof EmailCollisionError) {
        return fail(identityFailures.emailAlreadyRegistered());
      }

      throw cause;
    }
  }

  private async write(
    transaction: IdentityTransaction,
    credentials: AcceptedCredentials,
    passwordHash: PasswordHash,
    token: string,
  ): Promise<Result<WrittenRegistration, AppError>> {
    if (await transaction.users.existsWithEmail(credentials.email)) {
      return fail(identityFailures.emailAlreadyRegistered());
    }

    const registeredAt = this.clock.now();

    const user = User.register({
      id: this.idGenerator.generate(),
      displayName: credentials.displayName,
      email: credentials.email,
      passwordHash,
      registrationConsent: RegistrationConsent.accept({
        acceptedAt: registeredAt,
        policyVersion: this.policy.consentPolicyVersion,
      }),
      registeredAt,
    });

    const session = Session.issue({
      id: this.idGenerator.generate(),
      userId: user.id,
      tokenFingerprint: this.sessionTokens.fingerprint(token),
      issuedAt: registeredAt,
      lifetimeInDays: this.policy.sessionLifetimeInDays,
    });

    await transaction.users.save(user);
    await transaction.sessions.save(session);

    return ok({ user, session, recorded: user.pullEvents() });
  }

  /** Events reach the bus only once the transaction that recorded them committed. */
  private async announce(
    written: WrittenRegistration,
    token: string,
  ): Promise<RegisteredUserOutput> {
    await this.events.publish(written.recorded);

    const { user, session } = written;

    return {
      user: {
        id: user.id.value,
        name: user.displayName.value,
        email: user.email.value,
        registeredAt: user.registeredAt.toISOString(),
      },
      registrationConsent: {
        acceptedAt: user.registrationConsent.acceptedAt.toISOString(),
        policyVersion: user.registrationConsent.policyVersion,
        scope: user.registrationConsent.scope,
      },
      session: {
        token,
        expiresAt: session.expiresAt.toISOString(),
      },
    };
  }
}
