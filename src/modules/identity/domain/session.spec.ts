import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { UserSignedIn } from './events/user-signed-in.js';
import { UserSignedOut } from './events/user-signed-out.js';
import { Session, type SessionLifetime } from './session.js';

const ISSUED_AT = new Date('2026-10-03T13:04:11.182Z');
const SESSION_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77');
const USER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
const LIFETIME: SessionLifetime = { lifetimeInDays: 14, renewWithinDays: 7 };

function daysAfterIssue(days: number): Date {
  return new Date(ISSUED_AT.getTime() + days * 24 * 60 * 60 * 1000);
}

function anIssuedSession(): Session {
  return Session.issue({
    id: SESSION_ID,
    userId: USER_ID,
    tokenFingerprint: 'fingerprint',
    issuedAt: ISSUED_AT,
    lifetimeInDays: 14,
  });
}

describe('Session', () => {
  it('expires fourteen days after it was issued', () => {
    expect(anIssuedSession().expiresAt.toISOString()).toBe('2026-10-17T13:04:11.182Z');
  });

  it('is active while it has not expired', () => {
    expect(anIssuedSession().stateAt(daysAfterIssue(7))).toBe('ACTIVE');
  });

  it('is expired once its expiry has passed', () => {
    expect(anIssuedSession().stateAt(daysAfterIssue(15))).toBe('EXPIRED');
  });

  it('reports a revoked session as revoked even before it expires', () => {
    const session = anIssuedSession();
    session.signOut(daysAfterIssue(1));

    expect(session.stateAt(daysAfterIssue(2))).toBe('REVOKED');
  });

  it('refuses a lifetime that would expire the session before it was issued', () => {
    expect(() =>
      Session.issue({
        id: SESSION_ID,
        userId: USER_ID,
        tokenFingerprint: 'fingerprint',
        issuedAt: ISSUED_AT,
        lifetimeInDays: 0,
      }),
    ).toThrow();
  });

  it('records no event when registration issues it', () => {
    expect(anIssuedSession().pullEvents()).toHaveLength(0);
  });

  it('records UserSignedIn when sign-in issues it', () => {
    const session = Session.issueOnSignIn({
      id: SESSION_ID,
      userId: USER_ID,
      tokenFingerprint: 'fingerprint',
      issuedAt: ISSUED_AT,
      lifetimeInDays: 14,
    });

    const [event] = session.pullEvents();

    expect(event).toBeInstanceOf(UserSignedIn);
    expect(event?.payload).toEqual({
      userId: USER_ID.value,
      sessionId: SESSION_ID.value,
      signedInAt: '2026-10-03T13:04:11.182Z',
    });
  });

  describe('signing out', () => {
    it('revokes the session and records UserSignedOut', () => {
      const session = anIssuedSession();
      session.signOut(daysAfterIssue(1));

      const [event] = session.pullEvents();

      expect(session.revokedAt).toEqual(daysAfterIssue(1));
      expect(event).toBeInstanceOf(UserSignedOut);
      expect(event?.payload).toEqual({
        userId: USER_ID.value,
        sessionId: SESSION_ID.value,
        signedOutAt: daysAfterIssue(1).toISOString(),
      });
    });

    it('is idempotent, and records nothing the second time', () => {
      const session = anIssuedSession();
      session.signOut(daysAfterIssue(1));
      session.pullEvents();
      session.signOut(daysAfterIssue(2));

      expect(session.revokedAt).toEqual(daysAfterIssue(1));
      expect(session.pullEvents()).toHaveLength(0);
    });
  });

  describe('revoking after a password change', () => {
    it('revokes without recording a sign-out nobody performed', () => {
      const session = anIssuedSession();
      session.revokeAfterPasswordChange(daysAfterIssue(1));

      expect(session.stateAt(daysAfterIssue(2))).toBe('REVOKED');
      expect(session.pullEvents()).toHaveLength(0);
    });
  });

  describe('sliding on use', () => {
    it('leaves a session alone while it has more than a week left', () => {
      const session = anIssuedSession();

      expect(session.renewIfExpiringSoon(daysAfterIssue(3), LIFETIME)).toBe(false);
      expect(session.expiresAt.toISOString()).toBe('2026-10-17T13:04:11.182Z');
    });

    it('extends a session that is within a week of expiring', () => {
      const session = anIssuedSession();
      const used = daysAfterIssue(10);

      expect(session.renewIfExpiringSoon(used, LIFETIME)).toBe(true);
      expect(session.expiresAt).toEqual(daysAfterIssue(24));
      expect(session.lastUsedAt).toEqual(used);
    });

    it('never revives an expired session', () => {
      const session = anIssuedSession();

      expect(session.renewIfExpiringSoon(daysAfterIssue(15), LIFETIME)).toBe(false);
      expect(session.stateAt(daysAfterIssue(15))).toBe('EXPIRED');
    });

    it('never revives a revoked session', () => {
      const session = anIssuedSession();
      session.signOut(daysAfterIssue(1));

      expect(session.renewIfExpiringSoon(daysAfterIssue(10), LIFETIME)).toBe(false);
      expect(session.stateAt(daysAfterIssue(10))).toBe('REVOKED');
    });

    it('starts lastUsedAt at the moment it was issued', () => {
      expect(anIssuedSession().lastUsedAt).toEqual(ISSUED_AT);
    });
  });
});
