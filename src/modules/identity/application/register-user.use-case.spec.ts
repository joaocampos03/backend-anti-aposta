import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { UserRegistered } from '../domain/events/user-registered.js';
import { InMemoryIdentityUnitOfWork } from '../infrastructure/in-memory/in-memory-identity-unit-of-work.js';
import { InMemoryPasswordResetTokenRepository } from '../infrastructure/in-memory/in-memory-password-reset-token.repository.js';
import { InMemorySignInThrottleRepository } from '../infrastructure/in-memory/in-memory-sign-in-throttle.repository.js';
import { InMemoryPasswordHasher } from '../infrastructure/in-memory/in-memory-password-hasher.js';
import { InMemorySessionRepository } from '../infrastructure/in-memory/in-memory-session.repository.js';
import { InMemorySessionTokenGenerator } from '../infrastructure/in-memory/in-memory-session-token-generator.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory/in-memory-user.repository.js';
import { aRegistration } from '../testing/registration.builder.js';
import { RegisterUser } from './register-user.use-case.js';

const REGISTERED_AT = new Date('2026-10-03T13:04:11.182Z');
const POLICY_VERSION = '2026-10-01';

let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let events: RecordingEventPublisher;
let registerUser: RegisterUser;

beforeEach(() => {
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  events = new RecordingEventPublisher();
  registerUser = new RegisterUser(
    new InMemoryIdentityUnitOfWork(
      users,
      sessions,
      new InMemorySignInThrottleRepository(),
      new InMemoryPasswordResetTokenRepository(),
    ),
    new InMemoryPasswordHasher(),
    new InMemorySessionTokenGenerator(),
    new SequentialIdGenerator(),
    new FixedClock(REGISTERED_AT),
    events,
    { consentPolicyVersion: POLICY_VERSION, sessionLifetimeInDays: 14 },
  );
});

describe('RegisterUser', () => {
  it('creates the account and issues a session', async () => {
    const result = await registerUser.execute(aRegistration().build());

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.user).toEqual({
      id: '0192f3c1-7a1b-7c3e-9f20-000000000001',
      name: 'Ana',
      email: 'ana@exemplo.com',
      registeredAt: '2026-10-03T13:04:11.182Z',
    });
    expect(result.value.session.expiresAt).toBe('2026-10-17T13:04:11.182Z');
    expect(result.value.session.token).toBe('op_token_1');
  });

  it('records the registration consent from the clock, scoped to the name and the e-mail', async () => {
    const result = await registerUser.execute(aRegistration().build());

    expect(result.ok && result.value.registrationConsent).toEqual({
      acceptedAt: '2026-10-03T13:04:11.182Z',
      policyVersion: POLICY_VERSION,
      scope: 'NAME_AND_EMAIL',
    });
  });

  it('stores the password only as a hash', async () => {
    await registerUser.execute(aRegistration().withPassword('quatro palavras comuns').build());

    expect(users.users[0]?.passwordHash.value).toBe('hashed:quatro palavras comuns');
  });

  it('stores only the fingerprint of the session token', async () => {
    const result = await registerUser.execute(aRegistration().build());

    expect(result.ok && sessions.sessions[0]?.tokenFingerprint).toBe('fingerprint:op_token_1');
  });

  it('emits UserRegistered once, carrying no name and no e-mail', async () => {
    await registerUser.execute(aRegistration().build());

    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toBeInstanceOf(UserRegistered);
    expect(events.published[0]?.payload).toEqual({
      userId: '0192f3c1-7a1b-7c3e-9f20-000000000001',
      registeredAt: '2026-10-03T13:04:11.182Z',
    });
  });

  it('refuses the registration when the consent was not given, and creates no user', async () => {
    const result = await registerUser.execute(aRegistration().withoutConsent().build());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('CONSENT_REQUIRED');
    expect(!result.ok && result.error.message).toBe(
      'Para criar a conta é preciso autorizar o uso do nome e do e-mail.',
    );
    expect(users.users).toHaveLength(0);
    expect(events.published).toHaveLength(0);
  });

  it('refuses a second account for an address that differs only in case and padding', async () => {
    await registerUser.execute(aRegistration().withEmail('ana@exemplo.com').build());

    const result = await registerUser.execute(
      aRegistration().withEmail(' ANA@Exemplo.com ').build(),
    );

    expect(!result.ok && result.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(!result.ok && result.error.message).toBe(
      'Este e-mail já tem uma conta. Entre ou recupere a senha.',
    );
    expect(!result.ok && result.error.details).toEqual({ field: 'email' });
    expect(users.users).toHaveLength(1);
  });

  it('refuses a password shorter than eight characters with its own code', async () => {
    const result = await registerUser.execute(aRegistration().withPassword('curta12').build());

    expect(!result.ok && result.error.code).toBe('PASSWORD_TOO_SHORT');
    expect(!result.ok && result.error.message).toBe('Use pelo menos 8 caracteres.');
  });

  it('accepts a password the strength policy scores weak, because strength is advice', async () => {
    const result = await registerUser.execute(aRegistration().withPassword('Password1').build());

    expect(result.ok).toBe(true);
  });

  it('refuses a confirmation that does not match the password', async () => {
    const result = await registerUser.execute(
      aRegistration().withPasswordConfirmation('outra senha longa').build(),
    );

    expect(!result.ok && result.error.code).toBe('PASSWORD_CONFIRMATION_MISMATCH');
    expect(!result.ok && result.error.message).toBe('As duas senhas não são iguais.');
    expect(users.users).toHaveLength(0);
  });

  it('refuses a one-character name and anchors the message to the field', async () => {
    const result = await registerUser.execute(aRegistration().named('A').build());

    expect(!result.ok && result.error.code).toBe('VALIDATION_FAILED');
    expect(!result.ok && result.error.details).toEqual({
      name: 'Informe como você quer ser chamado — pelo menos 2 caracteres.',
    });
  });

  it('persists a padded name trimmed', async () => {
    const result = await registerUser.execute(aRegistration().named(' Ana ').build());

    expect(result.ok && result.value.user.name).toBe('Ana');
  });

  it('refuses an invalid address', async () => {
    const result = await registerUser.execute(aRegistration().withEmail('ana@exemplo').build());

    expect(!result.ok && result.error.details).toEqual({ email: 'Informe um e-mail válido.' });
  });

  it('reports every offending field at once', async () => {
    const result = await registerUser.execute(
      aRegistration().named('A').withEmail('nao-e-um-email').build(),
    );

    expect(!result.ok && result.error.details).toEqual({
      name: 'Informe como você quer ser chamado — pelo menos 2 caracteres.',
      email: 'Informe um e-mail válido.',
    });
  });

  it('refuses a password longer than 128 characters', async () => {
    const result = await registerUser.execute(
      aRegistration().withPassword('a'.repeat(129)).build(),
    );

    expect(!result.ok && result.error.code).toBe('VALIDATION_FAILED');
    expect(!result.ok && result.error.details).toEqual({
      password: 'Use no máximo 128 caracteres.',
    });
  });

  it('checks the consent before it looks at any other field', async () => {
    const result = await registerUser.execute(
      aRegistration().withoutConsent().named('A').withEmail('nao-e-um-email').build(),
    );

    expect(!result.ok && result.error.code).toBe('CONSENT_REQUIRED');
  });
});
