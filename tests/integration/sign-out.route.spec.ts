import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { createTestApp, VALID_REGISTRATION } from './test-app.js';

const REGISTER_PATH = '/api/v1/identity/users';
const SIGN_IN_PATH = '/api/v1/identity/sessions';
const CURRENT_SESSION_PATH = '/api/v1/identity/sessions/current';

const RIGHT_PAIR = {
  email: VALID_REGISTRATION.email,
  password: VALID_REGISTRATION.password,
};

async function signIn(): Promise<string> {
  const response = await request(createTestApp()).post(SIGN_IN_PATH).send(RIGHT_PAIR);

  expect(response.status).toBe(200);

  const token: unknown = response.body.session.token;

  return typeof token === 'string' ? token : '';
}

function signOut(token: string) {
  return request(createTestApp())
    .delete(CURRENT_SESSION_PATH)
    .set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  const registered = await request(createTestApp())
    .post(REGISTER_PATH)
    .send(VALID_REGISTRATION);

  expect(registered.status).toBe(201);
});

describe('DELETE /api/v1/identity/sessions/current', () => {
  it('answers 204 with an empty body', async () => {
    const response = await signOut(await signIn());

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('makes the token stop resolving', async () => {
    const token = await signIn();
    await signOut(token);

    const resolved = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(resolved.status).toBe(401);
    expect(resolved.body.error.code).toBe('SESSION_INVALID');
  });

  it('answers 204 both times when it is called twice', async () => {
    const token = await signIn();

    expect((await signOut(token)).status).toBe(204);
    expect((await signOut(token)).status).toBe(204);
  });

  it('answers 204 for a token that never existed', async () => {
    expect((await signOut('op_nunca_existiu')).status).toBe(204);
  });

  it('answers 204 with no Authorization header at all', async () => {
    const response = await request(createTestApp()).delete(CURRENT_SESSION_PATH);

    expect(response.status).toBe(204);
  });

  it('answers 204 for an expired token', async () => {
    const token = await signIn();
    const expired = new Date(Date.now() - 1_000);
    await prisma.session.updateMany({
      data: { issuedAt: new Date(expired.getTime() - 86_400_000), expiresAt: expired },
    });

    expect((await signOut(token)).status).toBe(204);
  });

  it('leaves the user signed in on their other devices', async () => {
    const firstDevice = await signIn();
    const secondDevice = await signIn();

    await signOut(firstDevice);

    const resolved = await request(createTestApp())
      .get(CURRENT_SESSION_PATH)
      .set('Authorization', `Bearer ${secondDevice}`);

    expect(resolved.status).toBe(200);
  });

  it('revokes rather than deletes, so the row records what happened', async () => {
    const token = await signIn();
    await signOut(token);

    const [session] = await prisma.session.findMany({ where: { revokedAt: { not: null } } });

    expect(session?.revokedAt).toBeInstanceOf(Date);
  });
});
