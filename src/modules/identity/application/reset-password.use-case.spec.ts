import { beforeEach, describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { PasswordChanged } from '../domain/events/password-changed.js';
import { PasswordResetToken } from '../domain/password-reset-token.js';
import { Session } from '../domain/session.js';
import { InMemoryIdentityUnitOfWork } from '../infrastructure/in-memory/in-memory-identity-unit-of-work.js';
import { InMemoryPasswordHasher } from '../infrastructure/in-memory/in-memory-password-hasher.js';
import { InMemoryPasswordResetTokenRepository } from '../infrastructure/in-memory/in-memory-password-reset-token.repository.js';
import { InMemoryPasswordVerifier } from '../infrastructure/in-memory/in-memory-password-verifier.js';
import { InMemorySessionRepository } from '../infrastructure/in-memory/in-memory-session.repository.js';
import { InMemorySessionTokenGenerator } from '../infrastructure/in-memory/in-memory-session-token-generator.js';
import { InMemorySignInThrottleRepository } from '../infrastructure/in-memory/in-memory-sign-in-throttle.repository.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory/in-memory-user.repository.js';
import { aRegistration } from '../testing/registration.builder.js';
import { RegisterUser } from './register-user.use-case.js';
import { ResetPassword } from './reset-password.use-case.js';
import { SignIn } from './sign-in.use-case.js';

const ISSUED_AT = new Date('2026-10-03T13:04:11.182Z');
const OLD_PASSWORD = 'quatro palavras comuns';
const NEW_PASSWORD = 'quatro palavras novas';
const RESET_TOKEN = 'rt_6b1e4a9d5c770192f3c17a1b7c3e9f20';

let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let throttles: InMemorySignInThrottleRepository;
let resetTokens: InMemoryPasswordResetTokenRepository;
let events: RecordingEventPublisher;
let clock: FixedClock;
let sessionTokens: InMemorySessionTokenGenerator;
let idGenerator: SequentialIdGenerator;
let resetPassword: ResetPassword;
let userId: UniqueEntityId;

function unitOfWork(): InMemoryIdentityUnitOfWork {
  return new InMemoryIdentityUnitOfWork(users, sessions, throttles, resetTokens);
}

async function issueResetToken(value: string, issuedAt: Date = ISSUED_AT): Promise<void> {
  await resetTokens.save(
    PasswordResetToken.issue({
      id: idGenerator.generate(),
      userId,
      tokenFingerprint: sessionTokens.fingerprint(value),
      issuedAt,
    }),
  );
}

function signInWith(password: string): Promise<{ ok: boolean }> {
  return new SignIn({
    unitOfWork: unitOfWork(),
    users,
    signInThrottles: throttles,
    passwordVerifier: new InMemoryPasswordVerifier(),
    sessionTokens,
    idGenerator,
    clock,
    events: new RecordingEventPublisher(),
    openFinanceConsents: { hasAuthorisedConsent: async () => false },
    sessionLifetimeInDays: 14,
  }).execute({ email: 'ana@exemplo.com', password });
}

beforeEach(async () => {
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  throttles = new InMemorySignInThrottleRepository();
  resetTokens = new InMemoryPasswordResetTokenRepository();
  events = new RecordingEventPublisher();
  clock = new FixedClock(ISSUED_AT);
  sessionTokens = new InMemorySessionTokenGenerator();
  idGenerator = new SequentialIdGenerator();

  const registered = await new RegisterUser(
    unitOfWork(),
    new InMemoryPasswordHasher(),
    sessionTokens,
    idGenerator,
    clock,
    new RecordingEventPublisher(),
    { consentPolicyVersion: '2026-10-01', sessionLifetimeInDays: 14 },
  ).execute(aRegistration().withPassword(OLD_PASSWORD).build());

  if (!registered.ok) {
    throw new Error('registration should have succeeded');
  }

  userId = UniqueEntityId.restore(registered.value.user.id);
  await issueResetToken(RESET_TOKEN);

  resetPassword = new ResetPassword({
    unitOfWork: unitOfWork(),
    users,
    passwordResetTokens: resetTokens,
    passwordHasher: new InMemoryPasswordHasher(),
    sessionTokens,
    clock,
    events,
  });
});

function reset(overrides: Partial<Record<'token' | 'password' | 'confirmation', string>> = {}) {
  return resetPassword.execute({
    token: overrides.token ?? RESET_TOKEN,
    password: overrides.password ?? NEW_PASSWORD,
    passwordConfirmation: overrides.confirmation ?? overrides.password ?? NEW_PASSWORD,
  });
}

describe('ResetPassword', () => {
  it('changes the password and says so', async () => {
    const result = await reset();

    expect(result.ok && result.value).toEqual({ status: 'PASSWORD_CHANGED' });
  });

  it('lets the new password sign the user in', async () => {
    await reset();

    expect((await signInWith(NEW_PASSWORD)).ok).toBe(true);
  });

  it('stops the old password from signing the user in', async () => {
    await reset();

    expect((await signInWith(OLD_PASSWORD)).ok).toBe(false);
  });

  it('issues no session: a reset link is not a way in', async () => {
    const before = sessions.sessions.length;
    await reset();

    expect(sessions.sessions).toHaveLength(before);
  });

  it('revokes every session, including one on another device', async () => {
    await sessions.save(
      Session.issueOnSignIn({
        id: idGenerator.generate(),
        userId,
        tokenFingerprint: 'outro-aparelho',
        issuedAt: ISSUED_AT,
        lifetimeInDays: 14,
      }),
    );

    await reset();

    expect(sessions.sessions.every((session) => session.revokedAt !== null)).toBe(true);
  });

  it('emits PasswordChanged once, carrying no address', async () => {
    await reset();

    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toBeInstanceOf(PasswordChanged);
    expect(Object.keys(events.published[0]?.payload as object).sort()).toEqual([
      'changedAt',
      'userId',
    ]);
  });

  describe('the token', () => {
    it('cannot be used twice', async () => {
      await reset();
      const result = await reset();

      expect(!result.ok && result.error.code).toBe('RESET_TOKEN_INVALID');
      expect(!result.ok && result.error.message).toBe(
        'Este link não é mais válido. Peça um novo link de redefinição.',
      );
    });

    it('answers the same for a token past its hour', async () => {
      clock.advanceByDays(1);
      const result = await reset();

      expect(!result.ok && result.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it('answers the same for a token that never existed', async () => {
      const result = await reset({ token: 'rt_nunca_existiu' });

      expect(!result.ok && result.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it('invalidates the other links outstanding for that user', async () => {
      await issueResetToken('rt_outro_link');
      await reset();

      const outstanding = await resetTokens.findPendingByUserId(userId);

      expect(outstanding).toHaveLength(0);
    });
  });

  describe('the new password', () => {
    it('refuses one shorter than eight characters, and keeps the link usable', async () => {
      const result = await reset({ password: 'curta12' });

      expect(!result.ok && result.error.code).toBe('PASSWORD_TOO_SHORT');
      expect(!result.ok && result.error.message).toBe('Use pelo menos 8 caracteres.');
      expect(await resetTokens.findPendingByUserId(userId)).toHaveLength(1);
    });

    it('refuses a mismatch, and keeps the link usable', async () => {
      const result = await reset({ confirmation: 'outra senha longa' });

      expect(!result.ok && result.error.code).toBe('PASSWORD_CONFIRMATION_MISMATCH');
      expect(!result.ok && result.error.message).toBe('As duas senhas não são iguais.');
      expect(await resetTokens.findPendingByUserId(userId)).toHaveLength(1);
    });

    it('accepts one the strength policy scores weak, as registration would', async () => {
      const result = await reset({ password: 'Password1' });

      expect(result.ok).toBe(true);
    });
  });
});
