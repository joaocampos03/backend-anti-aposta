import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { createTestApp, VALID_REGISTRATION } from './test-app.js';

const REGISTER_PATH = '/api/v1/identity/users';
const SIGN_IN_PATH = '/api/v1/identity/sessions';
const CURRENT_SESSION_PATH = '/api/v1/identity/sessions/current';

async function register(): Promise<string> {
  const response = await request(createTestApp()).post(REGISTER_PATH).send(VALID_REGISTRATION);

  expect(response.status).toBe(201);

  const id: unknown = response.body.user.id;

  return typeof id === 'string' ? id : '';
}

function signIn(body: Record<string, unknown>) {
  return request(createTestApp()).post(SIGN_IN_PATH).send(body);
}

const RIGHT_PAIR = {
  email: VALID_REGISTRATION.email,
  password: VALID_REGISTRATION.password,
};

let userId: string;

beforeEach(async () => {
  userId = await register();
});

describe('POST /api/v1/identity/sessions', () => {
  it('issues a session for the right pair', async () => {
    const response = await signIn(RIGHT_PAIR);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: userId,
      name: 'Ana',
      email: 'ana@exemplo.com',
    });
    expect(typeof response.body.session.token).toBe('string');
    expect(typeof response.body.session.expiresAt).toBe('string');
    expect(response.body.openFinance).toEqual({ hasAuthorisedConsent: false });
  });

  it('returns no password hash, no attempt counter and no cookie', async () => {
    const response = await signIn(RIGHT_PAIR);
    const body: string = JSON.stringify(response.body);

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(body).not.toContain('argon2');
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('attempts');
    expect(body).not.toContain('lastSignInAt');
  });

  it('signs in an address a phone keyboard capitalised and padded', async () => {
    const response = await signIn({ ...RIGHT_PAIR, email: ' ANA@Exemplo.com ' });

    expect(response.status).toBe(200);
  });

  it('expires the session fourteen days out', async () => {
    const response = await signIn(RIGHT_PAIR);
    const expiresAt = new Date(response.body.session.expiresAt).getTime();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;

    expect(Math.abs(expiresAt - (Date.now() + fourteenDays))).toBeLessThan(60_000);
  });

  it('issues a token GET /sessions/current accepts, exactly like registration', async () => {
    const issued = await signIn(RIGHT_PAIR);

    const resolved = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${issued.body.session.token}`);

    expect(resolved.status).toBe(200);
    expect(resolved.body.user.id).toBe(userId);
  });

  it('leaves the first device signed in when a second one signs in', async () => {
    const first = await signIn(RIGHT_PAIR);
    await signIn(RIGHT_PAIR);

    const resolved = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${first.body.session.token}`);

    expect(resolved.status).toBe(200);
  });

  it('reports the Open Finance flag from the consent aggregate', async () => {
    await prisma.consent.create({
      data: {
        id: '0192f3c1-7a1b-7c3e-9f20-0000000000aa',
        userId,
        status: 'AUTHORISED',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const response = await signIn(RIGHT_PAIR);

    expect(response.body.openFinance).toEqual({ hasAuthorisedConsent: true });
  });

  describe('a failure says one thing and one thing only', () => {
    it('refuses a wrong password with an empty details', async () => {
      const response = await signIn({ ...RIGHT_PAIR, password: 'senha errada' });

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.',
        details: {},
      });
    });

    it('answers an unknown address byte-identically to a wrong password', async () => {
      const unknown = await signIn({ email: 'ninguem@exemplo.com', password: 'tentativa' });
      const wrong = await signIn({ ...RIGHT_PAIR, password: 'senha errada' });

      expect(unknown.status).toBe(wrong.status);
      expect(unknown.text).toBe(wrong.text);
    });

    it('answers a deleted account the same way', async () => {
      await prisma.user.delete({ where: { id: userId } });

      const deleted = await signIn(RIGHT_PAIR);

      expect(deleted.status).toBe(401);
      expect(deleted.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('validation', () => {
    it('asks for the password when it is empty, rather than refusing the pair', async () => {
      const response = await signIn({ ...RIGHT_PAIR, password: '' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.details).toEqual({ password: 'Informe sua senha.' });
    });

    it('refuses an address that is not an address', async () => {
      const response = await signIn({ ...RIGHT_PAIR, email: 'ana@exemplo' });

      expect(response.status).toBe(422);
      expect(response.body.error.details).toEqual({ email: 'Informe um e-mail válido.' });
    });

    it('refuses a body that tries to set what the server computes', async () => {
      const response = await signIn({
        ...RIGHT_PAIR,
        session: { token: 'op_forjado' },
        openFinance: { hasAuthorisedConsent: true },
      });

      expect(response.status).toBe(422);
      expect(Object.keys(response.body.error.details).sort()).toEqual(['openFinance', 'session']);
    });

    it('enforces no minimum length, so a short existing password still works', async () => {
      // Six characters: shorter than the register form allows today. Whoever set
      // it before the policy existed must still get in.
      const short = 'seis12';
      await request(createTestApp())
        .post(REGISTER_PATH)
        .send({
          ...VALID_REGISTRATION,
          email: 'legada@exemplo.com',
          password: short,
          passwordConfirmation: short,
        });
      await prisma.$executeRawUnsafe(
        `UPDATE "identity_users" SET "password_hash" = (
           SELECT "password_hash" FROM "identity_users" WHERE "email" = 'ana@exemplo.com'
         ) WHERE "email" = 'legada@exemplo.com'`,
      );

      const response = await signIn({ email: 'legada@exemplo.com', password: 'curta' });

      // The password itself is wrong here, but the answer is 401 and never a
      // 422 about its length: this endpoint has no length rule to break.
      expect(response.status).toBe(401);
    });
  });

  describe('throttling', () => {
    it('delays after five failures and says how long, without a lockout', async () => {
      const app = createTestApp();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app).post(SIGN_IN_PATH).send({ ...RIGHT_PAIR, password: 'senha errada' });
      }

      const response = await request(app).post(SIGN_IN_PATH).send(RIGHT_PAIR);

      expect(response.status).toBe(429);
      expect(response.body.error).toEqual({
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
        details: { retryAfterSeconds: 60 },
      });
      expect(response.headers['retry-after']).toBe('60');
    });

    it('throttles an address with no account too, so the 429 leaks nothing', async () => {
      const app = createTestApp();
      const unknown = { email: 'ninguem@exemplo.com', password: 'tentativa' };

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app).post(SIGN_IN_PATH).send(unknown);
      }

      const response = await request(app).post(SIGN_IN_PATH).send(unknown);

      expect(response.status).toBe(429);
    });

    it('stores no lockout flag: the window is the whole mechanism', async () => {
      const app = createTestApp();

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await request(app).post(SIGN_IN_PATH).send({ ...RIGHT_PAIR, password: 'senha errada' });
      }

      const [row] = await prisma.signInThrottle.findMany();

      expect(Object.keys(row ?? {}).sort()).toEqual([
        'blockedUntil',
        'failureCount',
        'firstFailureAt',
        'identifierHash',
      ]);
      // Nothing in the users table changed: the account itself is untouched.
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.email).toBe('ana@exemplo.com');
    });

    it('stores the address as a fingerprint, never as an address', async () => {
      const app = createTestApp();
      await request(app).post(SIGN_IN_PATH).send({ ...RIGHT_PAIR, password: 'senha errada' });

      const [row] = await prisma.signInThrottle.findMany();

      expect(row?.identifierHash).not.toContain('ana');
      expect(row?.identifierHash).toHaveLength(64);
    });

    it('clears the window after a successful sign-in', async () => {
      const app = createTestApp();
      await request(app).post(SIGN_IN_PATH).send({ ...RIGHT_PAIR, password: 'senha errada' });
      await request(app).post(SIGN_IN_PATH).send(RIGHT_PAIR);

      const [row] = await prisma.signInThrottle.findMany();

      expect(row?.failureCount).toBe(0);
      expect(row?.blockedUntil).toBeNull();
    });
  });
});
