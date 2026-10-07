import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { PasswordResetToken } from './password-reset-token.js';

const TOKEN_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77');
const USER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
const ISSUED_AT = new Date('2026-10-03T13:00:00.000Z');

function anIssuedToken(): PasswordResetToken {
  return PasswordResetToken.issue({
    id: TOKEN_ID,
    userId: USER_ID,
    tokenFingerprint: 'fingerprint',
    issuedAt: ISSUED_AT,
  });
}

function minutesAfterIssue(minutes: number): Date {
  return new Date(ISSUED_AT.getTime() + minutes * 60 * 1000);
}

describe('PasswordResetToken', () => {
  it('expires sixty minutes after it was issued', () => {
    expect(anIssuedToken().expiresAt.toISOString()).toBe('2026-10-03T14:00:00.000Z');
  });

  it('is usable inside its hour', () => {
    expect(anIssuedToken().isUsableAt(minutesAfterIssue(59))).toBe(true);
  });

  it('stops being usable once it expires', () => {
    expect(anIssuedToken().isUsableAt(minutesAfterIssue(61))).toBe(false);
  });

  it('is single use', () => {
    const token = anIssuedToken();
    token.consume(minutesAfterIssue(1));

    expect(token.isUsableAt(minutesAfterIssue(2))).toBe(false);
  });

  it('keeps the moment of the first consumption when consumed again', () => {
    const token = anIssuedToken();
    token.consume(minutesAfterIssue(1));
    token.consume(minutesAfterIssue(5));

    expect(token.consumedAt?.toISOString()).toBe('2026-10-03T13:01:00.000Z');
  });

  it('stores a fingerprint, so a database row is not a working link', () => {
    expect(anIssuedToken().tokenFingerprint).toBe('fingerprint');
  });
});
