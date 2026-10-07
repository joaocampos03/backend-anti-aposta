import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { DisplayName } from './display-name.js';
import { Email } from './email.js';
import { UserRegistered } from './events/user-registered.js';
import { PasswordHash } from './password-hash.js';
import { RegistrationConsent } from './registration-consent.js';
import { User } from './user.js';

const REGISTERED_AT = new Date('2026-10-03T13:04:11.182Z');

function aUser(): User {
  const displayName = DisplayName.create('Ana');
  const email = Email.create('ana@exemplo.com');

  if (!displayName.ok || !email.ok) {
    throw new Error('fixture is invalid');
  }

  return User.register({
    id: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77'),
    displayName: displayName.value,
    email: email.value,
    passwordHash: PasswordHash.restore('$argon2id$v=19$m=19456,t=2,p=1$fixture'),
    registrationConsent: RegistrationConsent.accept({
      acceptedAt: REGISTERED_AT,
      policyVersion: '2026-10-01',
    }),
    registeredAt: REGISTERED_AT,
  });
}

describe('User', () => {
  it('carries the registration consent it was created with', () => {
    const user = aUser();

    expect(user.registrationConsent.scope).toBe('NAME_AND_EMAIL');
    expect(user.registrationConsent.acceptedAt).toEqual(REGISTERED_AT);
    expect(user.registrationConsent.policyVersion).toBe('2026-10-01');
  });

  it('records UserRegistered exactly once', () => {
    const events = aUser().pullEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(UserRegistered);
  });

  it('publishes neither the name nor the e-mail in the event payload', () => {
    const [event] = aUser().pullEvents();

    expect(event?.payload).toEqual({
      userId: '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77',
      registeredAt: '2026-10-03T13:04:11.182Z',
    });
  });

  it('hands its recorded events over only once', () => {
    const user = aUser();
    user.pullEvents();

    expect(user.pullEvents()).toHaveLength(0);
  });

  it('records no event when it is rehydrated from the database', () => {
    const user = aUser();
    const restored = User.restore(user.id, {
      displayName: user.displayName,
      email: user.email,
      passwordHash: user.passwordHash,
      registrationConsent: user.registrationConsent,
      registeredAt: user.registeredAt,
    });

    expect(restored.pullEvents()).toHaveLength(0);
  });
});
