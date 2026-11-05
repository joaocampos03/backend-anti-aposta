import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@shared/infrastructure/prisma.js';
import { registerCaller } from './ledger-fixture.js';
import { createTestApp, VALID_REGISTRATION } from './test-app.js';

const ACCOUNT_PATH = '/api/v1/identity/users/current';
const NAME_PATH = `${ACCOUNT_PATH}/display-name`;
const EMAIL_PATH = `${ACCOUNT_PATH}/email`;
const PASSWORD_PATH = `${ACCOUNT_PATH}/password`;
const DELETION_PATH = `${ACCOUNT_PATH}/deletion`;
const OTHER_SESSIONS_PATH = '/api/v1/identity/sessions/others';
const SESSIONS_PATH = '/api/v1/identity/sessions';
const CURRENT_SESSION_PATH = '/api/v1/identity/sessions/current';
const PASSWORD = VALID_REGISTRATION.password;
const NEW_PASSWORD = 'cinco palavras bem comuns';
const ANA_EMAIL = 'ana@exemplo.com';
const WRONG_PASSWORD = 'nao e esta senha';

let ana: { userId: string; token: string };

function api(): ReturnType<typeof request> {
  return request(createTestApp());
}

function asAna(test: request.Test, token = ana.token): request.Test {
  return test.set('Authorization', `Bearer ${token}`);
}

function signIn(email: string, password: string): request.Test {
  return api().post(SESSIONS_PATH).send({ email, password });
}

async function aSecondSession(): Promise<string> {
  const response = await signIn(ANA_EMAIL, PASSWORD);

  return response.body.session.token as string;
}

async function sessionStatus(token: string): Promise<number> {
  const response = await asAna(api().get(CURRENT_SESSION_PATH), token);

  return response.status;
}

beforeEach(async () => {
  ana = await registerCaller(ANA_EMAIL);
});

describe('GET /api/v1/identity/users/current', () => {
  it('refuses a caller without a session', async () => {
    expect((await api().get(ACCOUNT_PATH)).status).toBe(401);
  });

  it('describes the caller’s own account, without the password hash', async () => {
    await aSecondSession();

    const response = await asAna(api().get(ACCOUNT_PATH));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      user: { id: ana.userId, name: 'Ana', email: ANA_EMAIL },
      registrationConsent: { scope: 'NAME_AND_EMAIL' },
      activeSessionCount: 2,
    });
    expect(JSON.stringify(response.body)).not.toContain('argon2');
  });
});

describe('PUT /api/v1/identity/users/current/display-name', () => {
  it('changes how the person is called', async () => {
    const response = await asAna(api().put(NAME_PATH)).send({ name: '  Aninha  ' });
    const account = await asAna(api().get(ACCOUNT_PATH));

    expect(response.status).toBe(204);
    expect(account.body.user.name).toBe('Aninha');
  });

  it('refuses a name that is too short', async () => {
    const response = await asAna(api().put(NAME_PATH)).send({ name: 'A' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a caller without a session', async () => {
    expect((await api().put(NAME_PATH).send({ name: 'Bia' })).status).toBe(401);
  });
});

describe('PUT /api/v1/identity/users/current/email', () => {
  const NEW_EMAIL = 'nova@exemplo.com';

  it('moves the account to the new address, normalised', async () => {
    const response = await asAna(api().put(EMAIL_PATH)).send({
      email: '  NOVA@exemplo.com ',
      currentPassword: PASSWORD,
    });

    expect(response.status).toBe(204);
    expect((await signIn(NEW_EMAIL, PASSWORD)).status).toBe(200);
    expect((await signIn(ANA_EMAIL, PASSWORD)).status).toBe(401);
  });

  it('refuses without the right password, and changes nothing', async () => {
    const response = await asAna(api().put(EMAIL_PATH)).send({
      email: NEW_EMAIL,
      currentPassword: WRONG_PASSWORD,
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CURRENT_PASSWORD_INVALID');
    expect((await signIn(ANA_EMAIL, PASSWORD)).status).toBe(200);
  });

  it('checks the password before saying the address is taken', async () => {
    await registerCaller('bia@exemplo.com');

    const response = await asAna(api().put(EMAIL_PATH)).send({
      email: 'bia@exemplo.com',
      currentPassword: WRONG_PASSWORD,
    });

    expect(response.body.error.code).toBe('CURRENT_PASSWORD_INVALID');
  });

  it('answers 409 for somebody else’s address', async () => {
    await registerCaller('bia@exemplo.com');

    const response = await asAna(api().put(EMAIL_PATH)).send({
      email: 'bia@exemplo.com',
      currentPassword: PASSWORD,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('delays guesses at the password, as sign-in does', async () => {
    const guess = { email: NEW_EMAIL, currentPassword: WRONG_PASSWORD };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await asAna(api().put(EMAIL_PATH)).send(guess);
    }

    const response = await asAna(api().put(EMAIL_PATH)).send(guess);

    expect(response.status).toBe(429);
  });
});

describe('PUT /api/v1/identity/users/current/password', () => {
  const change = {
    currentPassword: PASSWORD,
    password: NEW_PASSWORD,
    passwordConfirmation: NEW_PASSWORD,
  };

  it('changes the password, ends the other sessions and keeps this one', async () => {
    const other = await aSecondSession();

    const response = await asAna(api().put(PASSWORD_PATH)).send(change);

    expect(response.status).toBe(204);
    expect(await sessionStatus(ana.token)).toBe(200);
    expect(await sessionStatus(other)).toBe(401);
    expect((await signIn(ANA_EMAIL, PASSWORD)).status).toBe(401);
    expect((await signIn(ANA_EMAIL, NEW_PASSWORD)).status).toBe(200);
  });

  it('refuses the wrong current password', async () => {
    const response = await asAna(api().put(PASSWORD_PATH)).send({
      ...change,
      currentPassword: WRONG_PASSWORD,
    });

    expect(response.body.error.code).toBe('CURRENT_PASSWORD_INVALID');
  });

  it('applies the same rules as registration', async () => {
    const tooShort = await asAna(api().put(PASSWORD_PATH)).send({
      ...change,
      password: 'curta',
      passwordConfirmation: 'curta',
    });
    const mismatch = await asAna(api().put(PASSWORD_PATH)).send({
      ...change,
      passwordConfirmation: 'outra coisa qualquer',
    });

    expect(tooShort.body.error.code).toBe('PASSWORD_TOO_SHORT');
    expect(mismatch.body.error.code).toBe('PASSWORD_CONFIRMATION_MISMATCH');
  });
});

describe('DELETE /api/v1/identity/sessions/others', () => {
  it('ends the other sessions and keeps this one', async () => {
    const other = await aSecondSession();

    const response = await asAna(api().delete(OTHER_SESSIONS_PATH));

    expect(response.status).toBe(204);
    expect(await sessionStatus(ana.token)).toBe(200);
    expect(await sessionStatus(other)).toBe(401);
  });

  it('leaves somebody else’s sessions alone', async () => {
    const bia = await registerCaller('bia@exemplo.com');

    await asAna(api().delete(OTHER_SESSIONS_PATH));

    expect(await sessionStatus(bia.token)).toBe(200);
  });

  it('refuses a caller without a session', async () => {
    expect((await api().delete(OTHER_SESSIONS_PATH)).status).toBe(401);
  });
});

describe('POST /api/v1/identity/users/current/deletion', () => {
  async function fillEveryContext(): Promise<void> {
    const moment = new Date();
    const goal = await asAna(api().post('/api/v1/savings-goals')).send({
      title: 'Trocar a geladeira',
      purpose: 'HOME',
      target: { amountInCents: 100_000, currency: 'BRL' },
    });

    expect(goal.status).toBe(201);

    await prisma.notification.create({
      data: {
        id: '0192f3c1-7a1b-7c3e-9f20-00000000d001',
        recipientId: ana.userId,
        kind: 'STREAK_BROKEN',
        content: { kind: 'STREAK_BROKEN', previousDays: 3 },
        createdAt: moment,
      },
    });
    await prisma.consent.create({
      data: {
        id: '0192f3c1-7a1b-7c3e-9f20-00000000c001',
        userId: ana.userId,
        externalConsentId: 'consent-at-the-bank',
        status: 'AUTHORISED',
        createdAt: moment,
        expiresAt: moment,
      },
    });
  }

  async function rowsLeftFor(userId: string): Promise<Record<string, number>> {
    return {
      users: await prisma.user.count({ where: { id: userId } }),
      sessions: await prisma.session.count({ where: { userId } }),
      consents: await prisma.consent.count({ where: { userId } }),
      badgeCollections: await prisma.badgeCollection.count({ where: { userId } }),
      savingsGoals: await prisma.savingsGoal.count({ where: { userId } }),
      inboxes: await prisma.inbox.count({ where: { userId } }),
      notifications: await prisma.notification.count({ where: { recipientId: userId } }),
    };
  }

  function deleteAccount(currentPassword: string = PASSWORD): request.Test {
    return asAna(api().post(DELETION_PATH)).send({ currentPassword });
  }

  it('refuses a caller without a session', async () => {
    expect((await api().post(DELETION_PATH).send({ currentPassword: PASSWORD })).status).toBe(401);
  });

  // The test app's bank is unreachable, and the consent here is still authorised:
  // an erasure the person is owed cannot wait on a third party.
  it('erases what every context keeps about the person at once, and only about them', async () => {
    const bia = await registerCaller('bia@exemplo.com');
    await fillEveryContext();

    const response = await deleteAccount();
    const left = await rowsLeftFor(ana.userId);

    expect(response.status).toBe(204);
    expect(Object.values(left).every((count) => count === 0)).toBe(true);
    expect((await rowsLeftFor(bia.userId))['users']).toBe(1);
    expect((await rowsLeftFor(bia.userId))['inboxes']).toBe(1);
  });

  it('ends every session of the account', async () => {
    const other = await aSecondSession();

    await deleteAccount();

    expect(await sessionStatus(ana.token)).toBe(401);
    expect(await sessionStatus(other)).toBe(401);
  });

  it('refuses without the right password, and erases nothing', async () => {
    await fillEveryContext();

    const response = await deleteAccount(WRONG_PASSWORD);
    const left = await rowsLeftFor(ana.userId);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CURRENT_PASSWORD_INVALID');
    expect(Object.values(left).every((count) => count > 0)).toBe(true);
    expect(await sessionStatus(ana.token)).toBe(200);
  });

  it('answers a later sign-in exactly like an unknown address', async () => {
    await deleteAccount();

    const deleted = await signIn(ANA_EMAIL, PASSWORD);
    const unknown = await signIn('ninguem@exemplo.com', PASSWORD);

    expect(deleted.status).toBe(401);
    expect(deleted.body).toEqual(unknown.body);
  });

  it('frees the address for a new account', async () => {
    await deleteAccount();

    const response = await api()
      .post('/api/v1/identity/users')
      .send({ ...VALID_REGISTRATION, email: ANA_EMAIL });

    expect(response.status).toBe(201);
    expect(response.body.user.id).not.toBe(ana.userId);
  });
});
