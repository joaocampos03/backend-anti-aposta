import { beforeEach, describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { DisplayName } from '../domain/display-name.js';
import { Email } from '../domain/email.js';
import { AccountDeleted } from '../domain/events/account-deleted.js';
import { PasswordHash } from '../domain/password-hash.js';
import { RegistrationConsent } from '../domain/registration-consent.js';
import { User } from '../domain/user.js';
import { InMemoryPasswordVerifier } from '../infrastructure/in-memory/in-memory-password-verifier.js';
import { InMemorySignInThrottleRepository } from '../infrastructure/in-memory/in-memory-sign-in-throttle.repository.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory/in-memory-user.repository.js';
import { CurrentPasswordCheck } from './current-password-check.js';
import { DeleteAccount } from './delete-account.use-case.js';
import type { AccountErasure } from './ports/account-erasure.port.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-0000000000aa';
const PASSWORD = 'quatro palavras comuns';
const NOW = new Date('2026-11-05T12:00:00.000Z');

class RecordingErasure implements AccountErasure {
  readonly erased: string[] = [];
  refuses = false;

  async eraseEverythingOf(userId: string): Promise<boolean> {
    this.erased.push(userId);

    return !this.refuses;
  }
}

function aUser(): User {
  const displayName = DisplayName.create('Ana');
  const email = Email.create('ana@exemplo.com');

  if (!displayName.ok || !email.ok) {
    throw new Error('fixture is invalid');
  }

  return User.register({
    id: UniqueEntityId.restore(USER_ID),
    displayName: displayName.value,
    email: email.value,
    passwordHash: PasswordHash.restore(`hashed:${PASSWORD}`),
    registrationConsent: RegistrationConsent.accept({
      acceptedAt: NOW,
      policyVersion: '2026-10-01',
    }),
    registeredAt: NOW,
  });
}

let users: InMemoryUserRepository;
let erasure: RecordingErasure;
let published: unknown[];
let deleteAccount: DeleteAccount;

beforeEach(async () => {
  const clock = new FixedClock(NOW);

  users = new InMemoryUserRepository();
  erasure = new RecordingErasure();
  published = [];
  deleteAccount = new DeleteAccount(
    users,
    new CurrentPasswordCheck({
      signInThrottles: new InMemorySignInThrottleRepository(),
      passwordVerifier: new InMemoryPasswordVerifier(),
      clock,
    }),
    erasure,
    clock,
    {
      publish: async (events) => {
        published.push(...events);
      },
    },
  );

  const user = aUser();
  user.pullEvents();
  await users.save(user);
});

describe('DeleteAccount', () => {
  it('erases every context and then the account, at once', async () => {
    const deleted = await deleteAccount.execute({ userId: USER_ID, currentPassword: PASSWORD });

    expect(deleted.ok).toBe(true);
    expect(erasure.erased).toEqual([USER_ID]);
    expect(users.users).toHaveLength(0);
    expect(published[0]).toBeInstanceOf(AccountDeleted);
  });

  it('erases nothing on the wrong password', async () => {
    const deleted = await deleteAccount.execute({ userId: USER_ID, currentPassword: 'outra senha' });

    expect(!deleted.ok && deleted.error.code).toBe('CURRENT_PASSWORD_INVALID');
    expect(erasure.erased).toEqual([]);
    expect(users.users).toHaveLength(1);
  });

  it('keeps the account when a context could not finish, so the person can try again', async () => {
    erasure.refuses = true;

    const failed = await deleteAccount.execute({ userId: USER_ID, currentPassword: PASSWORD });

    expect(!failed.ok && failed.error.code).toBe('ACCOUNT_DELETION_INCOMPLETE');
    expect(users.users).toHaveLength(1);
    expect(published).toEqual([]);

    erasure.refuses = false;

    const retried = await deleteAccount.execute({ userId: USER_ID, currentPassword: PASSWORD });

    expect(retried.ok).toBe(true);
    expect(users.users).toHaveLength(0);
  });
});
