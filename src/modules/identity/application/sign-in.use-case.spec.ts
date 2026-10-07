import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { UserSignedIn } from '../domain/events/user-signed-in.js';
import { SIGN_IN_FAILURE_THRESHOLD } from '../domain/sign-in-throttle.js';
import { InMemoryIdentityUnitOfWork } from '../infrastructure/in-memory/in-memory-identity-unit-of-work.js';
import { InMemoryPasswordHasher } from '../infrastructure/in-memory/in-memory-password-hasher.js';
import { InMemoryPasswordResetTokenRepository } from '../infrastructure/in-memory/in-memory-password-reset-token.repository.js';
import { InMemoryPasswordVerifier } from '../infrastructure/in-memory/in-memory-password-verifier.js';
import { InMemorySessionRepository } from '../infrastructure/in-memory/in-memory-session.repository.js';
import { InMemorySessionTokenGenerator } from '../infrastructure/in-memory/in-memory-session-token-generator.js';
import { InMemorySignInThrottleRepository } from '../infrastructure/in-memory/in-memory-sign-in-throttle.repository.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory/in-memory-user.repository.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { DisplayName } from '../domain/display-name.js';
import { Email } from '../domain/email.js';
import { PasswordHash } from '../domain/password-hash.js';
import { RegistrationConsent } from '../domain/registration-consent.js';
import { User } from '../domain/user.js';
import { aRegistration } from '../testing/registration.builder.js';
import type { AuthorisedConsentLookup } from './ports/authorised-consent-lookup.port.js';
import { RegisterUser } from './register-user.use-case.js';
import { SignIn } from './sign-in.use-case.js';

const REGISTERED_AT = new Date('2026-10-03T13:04:11.182Z');
const PASSWORD = 'quatro palavras comuns';

class ConsentLookupStub implements AuthorisedConsentLookup {
  constructor(private readonly authorised: boolean) {}

  async hasAuthorisedConsent(): Promise<boolean> {
    return this.authorised;
  }
}

let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let throttles: InMemorySignInThrottleRepository;
let verifier: InMemoryPasswordVerifier;
let events: RecordingEventPublisher;
let clock: FixedClock;
let signIn: SignIn;
// Shared across the fixtures on purpose: a generator per use case would mint
// the same id twice and the repositories would overwrite each other.
let idGenerator: SequentialIdGenerator;
let sessionTokens: InMemorySessionTokenGenerator;

function anEmail(address: string): Email {
  const email = Email.create(address);

  if (!email.ok) {
    throw new Error('fixture is invalid');
  }

  return email.value;
}

/** A user whose password is shorter than the policy the product has today. */
function aLegacyCredential(password: string): User {
  const displayName = DisplayName.create('Legada');

  if (!displayName.ok) {
    throw new Error('fixture is invalid');
  }

  return User.restore(UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-00000000beef'), {
    displayName: displayName.value,
    email: anEmail('legada@exemplo.com'),
    passwordHash: PasswordHash.restore(`hashed:${password}`),
    registrationConsent: RegistrationConsent.accept({
      acceptedAt: REGISTERED_AT,
      policyVersion: '2026-10-01',
    }),
    registeredAt: REGISTERED_AT,
  });
}

function buildSignIn(consent = new ConsentLookupStub(false)): SignIn {
  return new SignIn({
    unitOfWork: new InMemoryIdentityUnitOfWork(
      users,
      sessions,
      throttles,
      new InMemoryPasswordResetTokenRepository(),
    ),
    users,
    signInThrottles: throttles,
    passwordVerifier: verifier,
    sessionTokens,
    idGenerator,
    clock,
    events,
    openFinanceConsents: consent,
    sessionLifetimeInDays: 14,
  });
}

async function registerAna(): Promise<void> {
  const registerUser = new RegisterUser(
    new InMemoryIdentityUnitOfWork(
      users,
      sessions,
      throttles,
      new InMemoryPasswordResetTokenRepository(),
    ),
    new InMemoryPasswordHasher(),
    sessionTokens,
    idGenerator,
    clock,
    new RecordingEventPublisher(),
    { consentPolicyVersion: '2026-10-01', sessionLifetimeInDays: 14 },
  );

  const registered = await registerUser.execute(aRegistration().withPassword(PASSWORD).build());

  if (!registered.ok) {
    throw new Error('registration should have succeeded');
  }
}

beforeEach(async () => {
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  throttles = new InMemorySignInThrottleRepository();
  verifier = new InMemoryPasswordVerifier();
  events = new RecordingEventPublisher();
  clock = new FixedClock(REGISTERED_AT);
  idGenerator = new SequentialIdGenerator();
  sessionTokens = new InMemorySessionTokenGenerator();
  await registerAna();
  events.published.length = 0;
  signIn = buildSignIn();
});

describe('SignIn', () => {
  it('issues a session for the right pair', async () => {
    const result = await signIn.execute({ email: 'ana@exemplo.com', password: PASSWORD });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.user).toMatchObject({ name: 'Ana', email: 'ana@exemplo.com' });
    expect(result.value.session.token).toMatch(/^op_token_/);
    expect(result.value.session.expiresAt).toBe('2026-10-17T13:04:11.182Z');
  });

  it('signs in an address a phone keyboard capitalised and padded', async () => {
    const result = await signIn.execute({ email: ' ANA@Exemplo.com ', password: PASSWORD });

    expect(result.ok).toBe(true);
  });

  it('reports whether the user has an authorised Open Finance consent', async () => {
    const result = await buildSignIn(new ConsentLookupStub(true)).execute({
      email: 'ana@exemplo.com',
      password: PASSWORD,
    });

    expect(result.ok && result.value.openFinance).toEqual({ hasAuthorisedConsent: true });
  });

  it('emits UserSignedIn once, with no e-mail and no name', async () => {
    const result = await signIn.execute({ email: 'ana@exemplo.com', password: PASSWORD });

    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toBeInstanceOf(UserSignedIn);
    expect(Object.keys(events.published[0]?.payload as object).sort()).toEqual([
      'sessionId',
      'signedInAt',
      'userId',
    ]);
    expect(result.ok).toBe(true);
  });

  it('leaves the first device signed in when a second one signs in', async () => {
    await signIn.execute({ email: 'ana@exemplo.com', password: PASSWORD });
    await buildSignIn().execute({ email: 'ana@exemplo.com', password: PASSWORD });

    expect(sessions.sessions.filter((session) => session.revokedAt === null)).toHaveLength(3);
  });

  describe('a failure says one thing and one thing only', () => {
    it('refuses a wrong password without naming the field', async () => {
      const result = await signIn.execute({ email: 'ana@exemplo.com', password: 'senha errada' });

      expect(!result.ok && result.error.code).toBe('INVALID_CREDENTIALS');
      expect(!result.ok && result.error.message).toBe('E-mail ou senha incorretos.');
      expect(!result.ok && result.error.status).toBe(401);
      expect(!result.ok && result.error.details).toEqual({});
    });

    it('answers an unknown address exactly as it answers a wrong password', async () => {
      const unknown = await signIn.execute({ email: 'ninguem@exemplo.com', password: PASSWORD });
      const wrong = await signIn.execute({ email: 'ana@exemplo.com', password: 'senha errada' });

      expect(unknown).toEqual(wrong);
    });

    it('still spends a hash on an unknown address, so timing says nothing', async () => {
      await signIn.execute({ email: 'ninguem@exemplo.com', password: PASSWORD });

      expect(verifier.decoyVerifications).toBe(1);
    });

    it('issues no session and emits nothing', async () => {
      await signIn.execute({ email: 'ana@exemplo.com', password: 'senha errada' });

      expect(sessions.sessions).toHaveLength(1);
      expect(events.published).toHaveLength(0);
    });
  });

  describe('the throttle delays, it never locks', () => {
    async function failOnce(): Promise<void> {
      await signIn.execute({ email: 'ana@exemplo.com', password: 'senha errada' });
    }

    it('answers 429 once the threshold is passed, with a retry hint', async () => {
      for (let attempt = 0; attempt < SIGN_IN_FAILURE_THRESHOLD; attempt += 1) {
        await failOnce();
      }

      const result = await signIn.execute({ email: 'ana@exemplo.com', password: PASSWORD });

      expect(!result.ok && result.error.code).toBe('TOO_MANY_ATTEMPTS');
      expect(!result.ok && result.error.message).toBe(
        'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
      );
      expect(!result.ok && result.error.details).toEqual({ retryAfterSeconds: 60 });
    });

    it('accepts the correct password once the delay has passed, after any number of failures', async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await failOnce();
      }

      clock.advanceByDays(1);

      const result = await signIn.execute({ email: 'ana@exemplo.com', password: PASSWORD });

      expect(result.ok).toBe(true);
    });

    it('throttles an address with no account too, so a 429 leaks nothing', async () => {
      for (let attempt = 0; attempt < SIGN_IN_FAILURE_THRESHOLD; attempt += 1) {
        await signIn.execute({ email: 'ninguem@exemplo.com', password: 'tentativa' });
      }

      const result = await signIn.execute({ email: 'ninguem@exemplo.com', password: 'tentativa' });

      expect(!result.ok && result.error.code).toBe('TOO_MANY_ATTEMPTS');
    });

    it('is checked before the credential, so it costs no hash', async () => {
      for (let attempt = 0; attempt < SIGN_IN_FAILURE_THRESHOLD; attempt += 1) {
        await signIn.execute({ email: 'ninguem@exemplo.com', password: 'tentativa' });
      }

      const spentBefore = verifier.decoyVerifications;
      await signIn.execute({ email: 'ninguem@exemplo.com', password: 'tentativa' });

      expect(verifier.decoyVerifications).toBe(spentBefore);
    });

    it('clears the window after a successful sign-in', async () => {
      await failOnce();
      await failOnce();
      await signIn.execute({ email: 'ana@exemplo.com', password: PASSWORD });

      const throttle = await throttles.findByEmail(anEmail('ana@exemplo.com'));

      expect(throttle.failureCount).toBe(0);
    });
  });

  describe('validation', () => {
    it('asks for the password when the field is empty, rather than refusing the pair', async () => {
      const result = await signIn.execute({ email: 'ana@exemplo.com', password: '' });

      expect(!result.ok && result.error.code).toBe('VALIDATION_FAILED');
      expect(!result.ok && result.error.details).toEqual({ password: 'Informe sua senha.' });
    });

    it('refuses an address that is not an address', async () => {
      const result = await signIn.execute({ email: 'ana@exemplo', password: PASSWORD });

      expect(!result.ok && result.error.details).toEqual({ email: 'Informe um e-mail válido.' });
    });

    it('accepts a password shorter than the register form would now allow', async () => {
      // The stored credential predates the policy. Sign-in enforces no minimum
      // precisely so a rule that rises later cannot lock out whoever set a
      // shorter password before it existed.
      const legacy = aLegacyCredential('seis12');
      users.users.length = 0;
      users.users.push(legacy);

      const result = await signIn.execute({ email: 'legada@exemplo.com', password: 'seis12' });

      expect(result.ok).toBe(true);
    });
  });
});
