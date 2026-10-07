import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { InMemoryIdentityUnitOfWork } from '../infrastructure/in-memory/in-memory-identity-unit-of-work.js';
import { InMemoryPasswordResetTokenRepository } from '../infrastructure/in-memory/in-memory-password-reset-token.repository.js';
import { InMemorySignInThrottleRepository } from '../infrastructure/in-memory/in-memory-sign-in-throttle.repository.js';
import { InMemoryPasswordHasher } from '../infrastructure/in-memory/in-memory-password-hasher.js';
import { InMemorySessionRepository } from '../infrastructure/in-memory/in-memory-session.repository.js';
import { InMemorySessionTokenGenerator } from '../infrastructure/in-memory/in-memory-session-token-generator.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory/in-memory-user.repository.js';
import { Session } from '../domain/session.js';
import { aRegistration } from '../testing/registration.builder.js';
import type { AuthorisedConsentLookup } from './ports/authorised-consent-lookup.port.js';
import { RegisterUser } from './register-user.use-case.js';
import { ResolveSession } from './resolve-session.use-case.js';

const REGISTERED_AT = new Date('2026-10-03T13:04:11.182Z');

class ConsentLookupStub implements AuthorisedConsentLookup {
  constructor(private readonly authorised: boolean) {}

  async hasAuthorisedConsent(): Promise<boolean> {
    return this.authorised;
  }
}

let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let clock: FixedClock;
let sessionTokens: InMemorySessionTokenGenerator;
let registerUser: RegisterUser;

function resolverSeeing(consent: AuthorisedConsentLookup): ResolveSession {
  return new ResolveSession(sessions, users, sessionTokens, consent, clock, {
    lifetimeInDays: 14,
    renewWithinDays: 7,
  });
}

beforeEach(() => {
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  clock = new FixedClock(REGISTERED_AT);
  sessionTokens = new InMemorySessionTokenGenerator();
  registerUser = new RegisterUser(
    new InMemoryIdentityUnitOfWork(
      users,
      sessions,
      new InMemorySignInThrottleRepository(),
      new InMemoryPasswordResetTokenRepository(),
    ),
    new InMemoryPasswordHasher(),
    sessionTokens,
    new SequentialIdGenerator(),
    clock,
    new RecordingEventPublisher(),
    { consentPolicyVersion: '2026-10-01', sessionLifetimeInDays: 14 },
  );
});

describe('ResolveSession', () => {
  it('resolves the token a registration issued to the same user', async () => {
    const registration = await registerUser.execute(aRegistration().build());

    if (!registration.ok) {
      throw new Error('registration should have succeeded');
    }

    const result = await resolverSeeing(new ConsentLookupStub(false)).execute({
      token: registration.value.session.token,
    });

    expect(result.ok && result.value.user).toEqual({
      id: registration.value.user.id,
      name: 'Ana',
      email: 'ana@exemplo.com',
    });
    expect(result.ok && result.value.session.expiresAt).toBe('2026-10-17T13:04:11.182Z');
  });

  it('reports a brand-new user as having no authorised Open Finance consent', async () => {
    const registration = await registerUser.execute(aRegistration().build());

    if (!registration.ok) {
      throw new Error('registration should have succeeded');
    }

    const result = await resolverSeeing(new ConsentLookupStub(false)).execute({
      token: registration.value.session.token,
    });

    expect(result.ok && result.value.openFinance).toEqual({ hasAuthorisedConsent: false });
  });

  it('reports the flag open-finance answers, and never infers it', async () => {
    const registration = await registerUser.execute(aRegistration().build());

    if (!registration.ok) {
      throw new Error('registration should have succeeded');
    }

    const result = await resolverSeeing(new ConsentLookupStub(true)).execute({
      token: registration.value.session.token,
    });

    expect(result.ok && result.value.openFinance).toEqual({ hasAuthorisedConsent: true });
  });

  it('refuses an unknown token without saying whether it ever existed', async () => {
    const result = await resolverSeeing(new ConsentLookupStub(false)).execute({
      token: 'op_nunca_existiu',
    });

    expect(!result.ok && result.error.code).toBe('SESSION_INVALID');
    expect(!result.ok && result.error.status).toBe(401);
  });

  it('refuses an empty token, which is what a missing header amounts to', async () => {
    const result = await resolverSeeing(new ConsentLookupStub(false)).execute({ token: '' });

    expect(!result.ok && result.error.code).toBe('SESSION_INVALID');
  });

  it('refuses an expired token and does not renew it', async () => {
    const registration = await registerUser.execute(aRegistration().build());

    if (!registration.ok) {
      throw new Error('registration should have succeeded');
    }

    clock.advanceByDays(15);

    const result = await resolverSeeing(new ConsentLookupStub(false)).execute({
      token: registration.value.session.token,
    });

    expect(!result.ok && result.error.code).toBe('SESSION_EXPIRED');
    expect(sessions.sessions[0]?.expiresAt.toISOString()).toBe('2026-10-17T13:04:11.182Z');
  });

  it('refuses a revoked token as invalid rather than as expired', async () => {
    const registration = await registerUser.execute(aRegistration().build());
    const issued = sessions.sessions[0];

    if (!registration.ok || issued === undefined) {
      throw new Error('registration should have succeeded');
    }

    await sessions.save(
      Session.restore(issued.id, {
        userId: issued.userId,
        tokenFingerprint: issued.tokenFingerprint,
        issuedAt: issued.issuedAt,
        expiresAt: issued.expiresAt,
        lastUsedAt: issued.lastUsedAt,
        revokedAt: REGISTERED_AT,
      }),
    );

    const result = await resolverSeeing(new ConsentLookupStub(false)).execute({
      token: registration.value.session.token,
    });

    expect(!result.ok && result.error.code).toBe('SESSION_INVALID');
  });
});
