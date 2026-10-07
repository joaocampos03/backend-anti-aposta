import { describe, expect, it } from 'vitest';
import { RegisterUser } from '@modules/identity/application/register-user.use-case.js';
import type {
  IdentityTransaction,
  IdentityUnitOfWork,
} from '@modules/identity/application/ports/identity-unit-of-work.port.js';
import type { Session } from '@modules/identity/domain/session.js';
import type { SessionRepository } from '@modules/identity/domain/session.repository.js';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/argon2-password-hasher.js';
import { CryptoSessionTokenGenerator } from '@modules/identity/infrastructure/crypto-session-token-generator.js';
import { PrismaPasswordResetTokenRepository } from '@modules/identity/infrastructure/prisma-password-reset-token.repository.js';
import { PrismaSignInThrottleRepository } from '@modules/identity/infrastructure/prisma-sign-in-throttle.repository.js';
import { PrismaUserRepository } from '@modules/identity/infrastructure/prisma-user.repository.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SystemClock } from '@shared/infrastructure/system-clock.js';
import { prisma } from '@shared/infrastructure/prisma.js';
import { UuidV7IdGenerator } from '@shared/infrastructure/uuid-v7-id-generator.js';
import { VALID_REGISTRATION } from './test-app.js';

class SessionWriteFailure extends Error {}

/** Fails exactly where the acceptance criterion points: after the user was written. */
class FailingSessionRepository implements SessionRepository {
  async save(_session: Session): Promise<void> {
    throw new SessionWriteFailure('session could not be issued');
  }

  async findByTokenFingerprint(): Promise<Session | null> {
    return null;
  }

  async findActiveByUserId(): Promise<readonly Session[]> {
    return [];
  }
}

class FailingHalfwayUnitOfWork implements IdentityUnitOfWork {
  async run<TResult>(
    work: (transaction: IdentityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return await prisma.$transaction(async (client) =>
      work({
        users: new PrismaUserRepository(client),
        sessions: new FailingSessionRepository(),
        signInThrottles: new PrismaSignInThrottleRepository(client),
        passwordResetTokens: new PrismaPasswordResetTokenRepository(client),
      }),
    );
  }
}

describe('registration as one transaction', () => {
  it('leaves no user row when the session cannot be issued', async () => {
    const registerUser = new RegisterUser(
      new FailingHalfwayUnitOfWork(),
      new Argon2PasswordHasher(),
      new CryptoSessionTokenGenerator(),
      new UuidV7IdGenerator(new SystemClock()),
      new SystemClock(),
      new RecordingEventPublisher(),
      { consentPolicyVersion: '2026-10-01', sessionLifetimeInDays: 14 },
    );

    await expect(registerUser.execute({ ...VALID_REGISTRATION })).rejects.toThrow(
      SessionWriteFailure,
    );

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });
});
