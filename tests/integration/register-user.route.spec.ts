import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { createTestApp, VALID_REGISTRATION } from './test-app.js';

const REGISTER_PATH = '/api/v1/identity/users';

describe('POST /api/v1/identity/users', () => {
  it('creates the account, records the consent and issues a session', async () => {
    const response = await request(createTestApp()).post(REGISTER_PATH).send(VALID_REGISTRATION);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ name: 'Ana', email: 'ana@exemplo.com' });
    expect(response.body.registrationConsent).toMatchObject({
      policyVersion: '2026-10-01',
      scope: 'NAME_AND_EMAIL',
    });
    expect(typeof response.body.session.token).toBe('string');
    expect(typeof response.body.session.expiresAt).toBe('string');
  });

  it('returns no password hash and sets no cookie of its own', async () => {
    const response = await request(createTestApp()).post(REGISTER_PATH).send(VALID_REGISTRATION);

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('argon2');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('stores the password as an Argon2id hash, never as the password', async () => {
    await request(createTestApp()).post(REGISTER_PATH).send(VALID_REGISTRATION);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@exemplo.com' } });

    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(stored.passwordHash).not.toContain(VALID_REGISTRATION.password);
  });

  it('gives two users with the same password different hashes', async () => {
    const app = createTestApp();

    await request(app).post(REGISTER_PATH).send(VALID_REGISTRATION);
    await request(app)
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, email: 'bruno@exemplo.com' });

    const [first, second] = await prisma.user.findMany({ orderBy: { email: 'asc' } });

    expect(first?.passwordHash).not.toBe(second?.passwordHash);
  });

  it('refuses a second account for the same address, case and padding included', async () => {
    const app = createTestApp();
    await request(app).post(REGISTER_PATH).send(VALID_REGISTRATION);

    const response = await request(app)
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, email: ' ANA@Exemplo.com ' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'Este e-mail já tem uma conta. Entre ou recupere a senha.',
      details: { field: 'email' },
    });
    expect(await prisma.user.count()).toBe(1);
  });

  it('refuses a password shorter than eight characters', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, password: 'curta12', passwordConfirmation: 'curta12' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PASSWORD_TOO_SHORT');
    expect(response.body.error.message).toBe('Use pelo menos 8 caracteres.');
  });

  it('accepts a password the strength policy scores weak', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, password: 'Password1', passwordConfirmation: 'Password1' });

    expect(response.status).toBe(201);
  });

  it('refuses a confirmation that does not match the password', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, passwordConfirmation: 'outra senha longa' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PASSWORD_CONFIRMATION_MISMATCH');
    expect(response.body.error.message).toBe('As duas senhas não são iguais.');
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses the registration when the consent is false, and creates no user', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, acceptedRegistrationConsent: false });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CONSENT_REQUIRED');
    expect(response.body.error.message).toBe(
      'Para criar a conta é preciso autorizar o uso do nome e do e-mail.',
    );
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses the registration when the consent is absent', async () => {
    const response = await request(createTestApp()).post(REGISTER_PATH).send({
      name: VALID_REGISTRATION.name,
      email: VALID_REGISTRATION.email,
      password: VALID_REGISTRATION.password,
      passwordConfirmation: VALID_REGISTRATION.passwordConfirmation,
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CONSENT_REQUIRED');
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses a body that tries to set what the server computes', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({
        ...VALID_REGISTRATION,
        id: '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77',
        registeredAt: '2020-01-01T00:00:00.000Z',
        session: { token: 'op_forjado' },
        registrationConsent: { acceptedAt: '2020-01-01T00:00:00.000Z' },
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(response.body.error.details).sort()).toEqual([
      'id',
      'registeredAt',
      'registrationConsent',
      'session',
    ]);
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses a one-character name with the message that sits under the field', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, name: 'A' });

    expect(response.status).toBe(422);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Confira os campos destacados.',
      details: { name: 'Informe como você quer ser chamado — pelo menos 2 caracteres.' },
    });
  });

  it('persists a padded name trimmed', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, name: ' Ana ' });

    expect(response.status).toBe(201);
    expect(response.body.user.name).toBe('Ana');
  });

  it('refuses an invalid address', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, email: 'ana@exemplo' });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toEqual({ email: 'Informe um e-mail válido.' });
  });

  it('answers the envelope, not a parser error, for a malformed body', async () => {
    const response = await request(createTestApp())
      .post(REGISTER_PATH)
      .set('Content-Type', 'application/json')
      .send('{ "name": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MALFORMED_REQUEST');
  });

  it('answers 429 with Retry-After once the per-IP limit is spent', async () => {
    const app = createTestApp({ registrationAttemptsPerHour: 1 });

    await request(app).post(REGISTER_PATH).send(VALID_REGISTRATION);
    const response = await request(app)
      .post(REGISTER_PATH)
      .send({ ...VALID_REGISTRATION, email: 'bruno@exemplo.com' });

    expect(response.status).toBe(429);
    expect(response.body.error).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Muitas tentativas. Tente novamente em alguns minutos.',
      // Every throttled answer in the API carries the same retry hint, so one
      // branch in the Server Action handles all of them.
      details: { retryAfterSeconds: 3600 },
    });
    expect(response.headers['retry-after']).toBe('3600');
  });

  it('bootstraps an empty streak at zero days, an empty badge collection and an inbox', async () => {
    const response = await request(createTestApp()).post(REGISTER_PATH).send(VALID_REGISTRATION);
    const userId: string = response.body.user.id;

    const streak = await prisma.streak.findUniqueOrThrow({ where: { userId } });
    const collection = await prisma.badgeCollection.findUniqueOrThrow({
      where: { userId },
      include: { badges: true },
    });

    expect(streak.currentDays).toBe(0);
    expect(collection.badges).toEqual([]);
    expect(await prisma.inbox.count({ where: { userId } })).toBe(1);
  });

  it('leaves a brand-new user with no authorised Open Finance consent', async () => {
    const response = await request(createTestApp()).post(REGISTER_PATH).send(VALID_REGISTRATION);

    expect(
      await prisma.consent.count({
        where: { userId: response.body.user.id, status: 'AUTHORISED' },
      }),
    ).toBe(0);
  });
});
