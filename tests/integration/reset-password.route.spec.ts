import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { createTestApp, VALID_REGISTRATION } from './test-app.js';

const REGISTER_PATH = '/api/v1/identity/users';
const SIGN_IN_PATH = '/api/v1/identity/sessions';
const CURRENT_SESSION_PATH = '/api/v1/identity/sessions/current';
const RESET_PATH = '/api/v1/identity/password-resets';

const RESET_TOKEN = 'rt_6b1e4a9d5c770192f3c17a1b7c3e9f20';
const NEW_PASSWORD = 'quatro palavras novas';
const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

let userId: string;

/**
 * Mints a token directly, the way the request endpoint will once the mail
 * decision lands: only its SHA-256 reaches the database.
 */
async function issueResetToken(value: string, issuedAt: Date = new Date()): Promise<void> {
  await prisma.passwordResetToken.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: createHash('sha256').update(value).digest('hex'),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + HOUR_IN_MILLISECONDS),
    },
  });
}

function reset(body: Record<string, unknown>) {
  return request(createTestApp()).post(RESET_PATH).send(body);
}

function resetWith(password: string, confirmation: string = password) {
  return reset({ token: RESET_TOKEN, password, passwordConfirmation: confirmation });
}

function signInWith(password: string) {
  return request(createTestApp())
    .post(SIGN_IN_PATH)
    .send({ email: VALID_REGISTRATION.email, password });
}

beforeEach(async () => {
  const registered = await request(createTestApp())
    .post(REGISTER_PATH)
    .send(VALID_REGISTRATION);

  expect(registered.status).toBe(201);
  userId = registered.body.user.id;
  await issueResetToken(RESET_TOKEN);
});

describe('POST /api/v1/identity/password-resets', () => {
  it('changes the password and says so', async () => {
    const response = await resetWith(NEW_PASSWORD);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'PASSWORD_CHANGED' });
  });

  it('lets the new password sign the user in', async () => {
    await resetWith(NEW_PASSWORD);

    expect((await signInWith(NEW_PASSWORD)).status).toBe(200);
  });

  it('stops the old password from signing the user in', async () => {
    await resetWith(NEW_PASSWORD);

    expect((await signInWith(VALID_REGISTRATION.password)).status).toBe(401);
  });

  it('issues no session: the user signs in afterwards', async () => {
    const response = await resetWith(NEW_PASSWORD);

    expect(response.body.session).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('revokes every session, including one on another device', async () => {
    const firstDevice = (await signInWith(VALID_REGISTRATION.password)).body.session.token;
    const secondDevice = (await signInWith(VALID_REGISTRATION.password)).body.session.token;

    await resetWith(NEW_PASSWORD);

    for (const token of [firstDevice, secondDevice]) {
      const resolved = await request(createTestApp())
        .get(CURRENT_SESSION_PATH)
        .set('Authorization', `Bearer ${token}`);

      expect(resolved.status).toBe(401);
    }
  });

  it('stores the new password as a fresh Argon2id hash', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await resetWith(NEW_PASSWORD);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    expect(after.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash).not.toContain(NEW_PASSWORD);
  });

  describe('the token', () => {
    it('cannot be used twice', async () => {
      await resetWith(NEW_PASSWORD);
      const response = await resetWith('outra senha ainda');

      expect(response.status).toBe(422);
      expect(response.body.error).toEqual({
        code: 'RESET_TOKEN_INVALID',
        message: 'Este link não é mais válido. Peça um novo link de redefinição.',
        details: {},
      });
    });

    it('answers the same for a token past its hour', async () => {
      await prisma.passwordResetToken.deleteMany();
      await issueResetToken(RESET_TOKEN, new Date(Date.now() - 2 * HOUR_IN_MILLISECONDS));

      const response = await resetWith(NEW_PASSWORD);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it('answers the same for a token that never existed', async () => {
      const response = await reset({
        token: 'rt_nunca_existiu',
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it('is stored hashed, so a database row is not a working link', async () => {
      const [stored] = await prisma.passwordResetToken.findMany();

      expect(stored?.tokenHash).not.toBe(RESET_TOKEN);
      expect(stored?.tokenHash).toHaveLength(64);
    });

    it('invalidates the other links outstanding for that user', async () => {
      await issueResetToken('rt_outro_link');
      await resetWith(NEW_PASSWORD);

      const outstanding = await prisma.passwordResetToken.findMany({
        where: { userId, consumedAt: null },
      });

      expect(outstanding).toHaveLength(0);
    });
  });

  describe('the new password', () => {
    it('refuses one shorter than eight characters and keeps the link usable', async () => {
      const response = await resetWith('curta12');

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('PASSWORD_TOO_SHORT');
      expect(response.body.error.message).toBe('Use pelo menos 8 caracteres.');
      expect(await prisma.passwordResetToken.count({ where: { consumedAt: null } })).toBe(1);
    });

    it('refuses a mismatch and keeps the link usable', async () => {
      const response = await resetWith(NEW_PASSWORD, 'outra senha longa');

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('PASSWORD_CONFIRMATION_MISMATCH');
      expect(response.body.error.message).toBe('As duas senhas não são iguais.');
      expect(await prisma.passwordResetToken.count({ where: { consumedAt: null } })).toBe(1);
    });

    it('accepts one the strength policy scores weak, as registration would', async () => {
      const response = await resetWith('Password1');

      expect(response.status).toBe(200);
    });

    it('refuses a body that carries an unexpected field', async () => {
      const response = await reset({
        token: RESET_TOKEN,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
        userId: '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77',
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
