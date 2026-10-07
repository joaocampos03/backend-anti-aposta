import type { PrismaClient } from '@prisma/client';
import { CreateBadgeCollection, StartStreak } from '@modules/gamification/index.js';
import { UserRegistered } from '@modules/identity/index.js';
import { RegisterUser } from '@modules/identity/application/register-user.use-case.js';
import { ResetPassword } from '@modules/identity/application/reset-password.use-case.js';
import { ResolveSession } from '@modules/identity/application/resolve-session.use-case.js';
import { SignIn } from '@modules/identity/application/sign-in.use-case.js';
import { SignOut } from '@modules/identity/application/sign-out.use-case.js';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/argon2-password-hasher.js';
import { CryptoSessionTokenGenerator } from '@modules/identity/infrastructure/crypto-session-token-generator.js';
import { OpenFinanceAuthorisedConsentLookup } from '@modules/identity/infrastructure/open-finance-authorised-consent-lookup.js';
import { PrismaIdentityUnitOfWork } from '@modules/identity/infrastructure/prisma-identity-unit-of-work.js';
import { PrismaPasswordResetTokenRepository } from '@modules/identity/infrastructure/prisma-password-reset-token.repository.js';
import { PrismaSessionRepository } from '@modules/identity/infrastructure/prisma-session.repository.js';
import { PrismaSignInThrottleRepository } from '@modules/identity/infrastructure/prisma-sign-in-throttle.repository.js';
import { PrismaUserRepository } from '@modules/identity/infrastructure/prisma-user.repository.js';
import { IdentityController } from '@modules/identity/http/identity.controller.js';
import {
  registerUserBodySchema,
  resetPasswordBodySchema,
  signInBodySchema,
} from '@modules/identity/http/identity.schemas.js';
import { identityFailures } from '@modules/identity/application/identity.failures.js';
import { IDENTITY_MESSAGES } from '@modules/identity/application/identity.messages.js';
import { CreateInbox } from '@modules/notifications/index.js';
import { PrismaInboxRepository } from '@modules/notifications/infrastructure/prisma-inbox.repository.js';
import { PrismaBadgeCollectionRepository } from '@modules/gamification/infrastructure/prisma-badge-collection.repository.js';
import { PrismaStreakRepository } from '@modules/gamification/infrastructure/prisma-streak.repository.js';
import { AuthorisedConsentQuery } from '@modules/open-finance/index.js';
import type { Clock } from '@shared/application/clock.port.js';
import { InProcessEventBus } from '@shared/infrastructure/in-process-event-bus.js';
import type { Logger } from '@shared/infrastructure/logger.js';
import { SystemClock } from '@shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '@shared/infrastructure/uuid-v7-id-generator.js';
import { windowedRateLimit } from '@shared/http/rate-limit.js';
import { validateBody } from '@shared/http/validate.js';
import type { AppDependencies } from './app.js';

const MINUTES_IN_AN_HOUR = 60;
const MINUTES_IN_A_QUARTER_HOUR = 15;

export interface ContainerSettings {
  readonly consentPolicyVersion: string;
  readonly sessionLifetimeInDays: number;
  readonly sessionRenewWithinDays: number;
  readonly registrationAttemptsPerHour: number;
  readonly registrationSuccessesPerHour: number;
  readonly signInAttemptsPerQuarterHour: number;
  readonly passwordResetAttemptsPerHour: number;
}

export interface ContainerInput {
  readonly prisma: PrismaClient;
  readonly logger: Logger;
  readonly frontendOrigin: string;
  readonly settings: ContainerSettings;
  /** Overridden in tests so an issued session always lands on the same instant. */
  readonly clock?: Clock;
}

/**
 * The composition root: the only file that wires a port to an adapter, and the
 * only place that knows which context reacts to which event.
 */
export function buildContainer(input: ContainerInput): AppDependencies {
  const clock = input.clock ?? new SystemClock();
  const idGenerator = new UuidV7IdGenerator(clock);
  const eventBus = new InProcessEventBus(input.logger);
  const sessionTokens = new CryptoSessionTokenGenerator();
  const passwords = new Argon2PasswordHasher();
  const unitOfWork = new PrismaIdentityUnitOfWork(input.prisma);
  const users = new PrismaUserRepository(input.prisma);
  const sessions = new PrismaSessionRepository(input.prisma);
  const openFinanceConsents = new OpenFinanceAuthorisedConsentLookup(
    new AuthorisedConsentQuery(input.prisma, clock),
  );
  const sessionLifetime = {
    lifetimeInDays: input.settings.sessionLifetimeInDays,
    renewWithinDays: input.settings.sessionRenewWithinDays,
  };

  const registerUser = new RegisterUser(
    unitOfWork,
    passwords,
    sessionTokens,
    idGenerator,
    clock,
    eventBus,
    {
      consentPolicyVersion: input.settings.consentPolicyVersion,
      sessionLifetimeInDays: input.settings.sessionLifetimeInDays,
    },
  );

  const signIn = new SignIn({
    unitOfWork,
    users,
    signInThrottles: new PrismaSignInThrottleRepository(input.prisma),
    passwordVerifier: passwords,
    sessionTokens,
    idGenerator,
    clock,
    events: eventBus,
    openFinanceConsents,
    sessionLifetimeInDays: input.settings.sessionLifetimeInDays,
  });

  const signOut = new SignOut(sessions, sessionTokens, clock, eventBus);

  const resolveSession = new ResolveSession(
    sessions,
    users,
    sessionTokens,
    openFinanceConsents,
    clock,
    sessionLifetime,
  );

  const resetPassword = new ResetPassword({
    unitOfWork,
    users,
    passwordResetTokens: new PrismaPasswordResetTokenRepository(input.prisma),
    passwordHasher: passwords,
    sessionTokens,
    clock,
    events: eventBus,
  });

  subscribeToRegistration({
    eventBus,
    startStreak: new StartStreak(new PrismaStreakRepository(input.prisma), idGenerator, clock),
    createBadgeCollection: new CreateBadgeCollection(
      new PrismaBadgeCollectionRepository(input.prisma),
      idGenerator,
      clock,
    ),
    createInbox: new CreateInbox(new PrismaInboxRepository(input.prisma), idGenerator, clock),
  });

  const bodies = {
    registerUser: validateBody(registerUserBodySchema, identityFailures.validationFailed),
    signIn: validateBody(signInBodySchema, identityFailures.validationFailed),
    resetPassword: validateBody(resetPasswordBodySchema, identityFailures.validationFailed),
  };

  return {
    logger: input.logger,
    frontendOrigin: input.frontendOrigin,
    health: {
      isDatabaseReachable: async () => {
        await input.prisma.$queryRaw`SELECT 1`;

        return true;
      },
    },
    identity: {
      controller: new IdentityController(
        { registerUser, signIn, signOut, resolveSession, resetPassword },
        bodies,
      ),
      validateRegisterUserBody: bodies.registerUser.middleware,
      validateSignInBody: bodies.signIn.middleware,
      validateResetPasswordBody: bodies.resetPassword.middleware,
      registrationRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_REQUESTS',
          message: IDENTITY_MESSAGES.tooManyRegistrationAttempts,
          limit: input.settings.registrationAttemptsPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
        }),
        windowedRateLimit({
          code: 'TOO_MANY_REQUESTS',
          message: IDENTITY_MESSAGES.tooManyRegistrationAttempts,
          limit: input.settings.registrationSuccessesPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
          countSuccessesOnly: true,
        }),
      ],
      // The per-IP net. The window that protects one account from guessing is
      // the domain's `SignInThrottle`, which this cannot see and must not
      // replace: it is keyed by address, so spraying across many addresses from
      // one host would slip past it.
      signInRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_ATTEMPTS',
          message: IDENTITY_MESSAGES.tooManySignInAttempts,
          limit: input.settings.signInAttemptsPerQuarterHour,
          windowInMinutes: MINUTES_IN_A_QUARTER_HOUR,
        }),
      ],
      passwordResetRateLimits: [
        windowedRateLimit({
          code: 'TOO_MANY_ATTEMPTS',
          message: IDENTITY_MESSAGES.tooManySignInAttempts,
          limit: input.settings.passwordResetAttemptsPerHour,
          windowInMinutes: MINUTES_IN_AN_HOUR,
        }),
      ],
    },
  };
}

interface RegistrationSubscribers {
  readonly eventBus: InProcessEventBus;
  readonly startStreak: StartStreak;
  readonly createBadgeCollection: CreateBadgeCollection;
  readonly createInbox: CreateInbox;
}

/**
 * `UserRegistered` bootstraps an empty aggregate in each reacting context, so no
 * first-run screen has to tell "no aggregate" from "empty aggregate". The streak
 * starts at zero days, and nothing is pushed to the notification stream.
 *
 * Nothing subscribes to `UserSignedIn`, `UserSignedOut` or `PasswordChanged`:
 * they are recorded for audit, and **no notification is ever sent for a
 * sign-in** — a "novo acesso à sua conta" push would put an alarming message on
 * a lock screen for a routine event.
 */
function subscribeToRegistration(subscribers: RegistrationSubscribers): void {
  subscribers.eventBus.subscribe(UserRegistered.NAME, async (event) => {
    if (!(event instanceof UserRegistered)) {
      return;
    }

    const { userId } = event.payload;

    await subscribers.startStreak.execute({ userId });
    await subscribers.createBadgeCollection.execute({ userId });
    await subscribers.createInbox.execute({ userId });
  });
}
