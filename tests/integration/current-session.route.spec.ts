import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { createTestApp, VALID_REGISTRATION } from './test-app.js';

const REGISTER_PATH = '/api/v1/identity/users';
const CURRENT_SESSION_PATH = '/api/v1/identity/sessions/current';

interface Registration {
  readonly userId: string;
  readonly token: string;
}

async function register(): Promise<Registration> {
  const response = await request(createTestApp()).post(REGISTER_PATH).send(VALID_REGISTRATION);

  expect(response.status).toBe(201);

  return { userId: response.body.user.id, token: response.body.session.token };
}

describe('GET /api/v1/identity/sessions/current', () => {
  it('resolves the token a registration issued to the same user', async () => {
    const { userId, token } = await register();

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: userId, name: 'Ana', email: 'ana@exemplo.com' });
    expect(typeof response.body.session.expiresAt).toBe('string');
  });

  it('reports a brand-new user as having no authorised Open Finance consent', async () => {
    const { token } = await register();

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.openFinance).toEqual({ hasAuthorisedConsent: false });
  });

  it('reports the flag from the consent aggregate once one is authorised', async () => {
    const { userId, token } = await register();

    await prisma.consent.create({
      data: {
        id: '0192f3c1-7a1b-7c3e-9f20-0000000000aa',
        userId,
        status: 'AUTHORISED',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.openFinance).toEqual({ hasAuthorisedConsent: true });
  });

  it('ignores a consent that is no longer authorised', async () => {
    const { userId, token } = await register();

    await prisma.consent.create({
      data: {
        id: '0192f3c1-7a1b-7c3e-9f20-0000000000bb',
        userId,
        status: 'REVOKED',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.openFinance).toEqual({ hasAuthorisedConsent: false });
  });

  it('refuses a tampered token without revealing whether it ever existed', async () => {
    const { token } = await register();

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}x`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_INVALID');
    expect(response.body.error.details).toEqual({});
  });

  it('refuses a request with no Authorization header', async () => {
    const response = await request(createTestApp()).get(CURRENT_SESSION_PATH);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_INVALID');
  });

  it('refuses an expired token and does not renew it', async () => {
    const { userId, token } = await register();

    // Both ends move: the CHECK constraint refuses a session that expires
    // before it was issued, which is exactly what it is there for.
    const expired = new Date(Date.now() - 1_000);
    await prisma.session.updateMany({
      where: { userId },
      data: { issuedAt: new Date(expired.getTime() - 86_400_000), expiresAt: expired },
    });

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');

    const stored = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(stored.expiresAt.getTime()).toBe(expired.getTime());
  });

  it('refuses a revoked token as invalid', async () => {
    const { userId, token } = await register();

    await prisma.session.updateMany({ where: { userId }, data: { revokedAt: new Date() } });

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_INVALID');
  });

  it('never stores the token itself, only its fingerprint', async () => {
    const { userId, token } = await register();

    const stored = await prisma.session.findFirstOrThrow({ where: { userId } });

    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it('returns no password hash and no third-party token', async () => {
    const { token } = await register();

    const response = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    const body: string = JSON.stringify(response.body);

    expect(body).not.toContain('argon2');
    expect(body).not.toContain('token');
  });
});
