import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { CLIENT_ID, NOW } from '../testing/sandbox-bank.builders.js';
import { IssuedToken, type TokenKind, type TokenScope } from './issued-token.js';

const LATER = new Date(NOW.getTime() + 60 * 60 * 1000);

function aToken(kind: TokenKind = 'ACCESS', scope: TokenScope = 'ACCOUNTS'): IssuedToken {
  return IssuedToken.issue({
    id: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77'),
    tokenFingerprint: 'fingerprint',
    kind,
    scope,
    clientId: CLIENT_ID,
    consentId: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c78'),
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
  });
}

describe('IssuedToken', () => {
  it('grants its own scope while it lasts', () => {
    expect(aToken().grantsAccessAt('ACCOUNTS', NOW)).toBe(true);
  });

  it('grants nothing outside its scope', () => {
    expect(aToken('ACCESS', 'CONSENTS').grantsAccessAt('ACCOUNTS', NOW)).toBe(false);
  });

  it('grants nothing once it expires', () => {
    expect(aToken().grantsAccessAt('ACCOUNTS', LATER)).toBe(false);
  });

  it('grants nothing once revoked', () => {
    const token = aToken();
    token.revoke(NOW);

    expect(token.grantsAccessAt('ACCOUNTS', NOW)).toBe(false);
  });

  it('never lets a refresh token stand in for an access token', () => {
    expect(aToken('REFRESH').grantsAccessAt('ACCOUNTS', NOW)).toBe(false);
  });

  it('refreshes only for the client it was issued to', () => {
    const refresh = aToken('REFRESH');

    expect(refresh.isRefreshableBy(CLIENT_ID, NOW)).toBe(true);
    expect(refresh.isRefreshableBy('another-client', NOW)).toBe(false);
  });
});
