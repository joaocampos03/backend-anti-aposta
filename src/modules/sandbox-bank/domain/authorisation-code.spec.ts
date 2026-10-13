import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { CLIENT_ID, NOW } from '../testing/sandbox-bank.builders.js';
import { AuthorisationCode } from './authorisation-code.js';

const CONSENT_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77');
const REDIRECT = 'http://localhost:3000/api/open-finance/callback';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const SIX_MINUTES_LATER = new Date(NOW.getTime() + 6 * 60 * 1000);

function aCode(): AuthorisationCode {
  return AuthorisationCode.issue({
    id: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c78'),
    codeFingerprint: 'fingerprint',
    consentId: CONSENT_ID,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    issuedAt: NOW,
  });
}

const VALID = {
  clientId: CLIENT_ID,
  redirectUri: REDIRECT,
  presentedChallenge: CHALLENGE,
  moment: NOW,
};

describe('AuthorisationCode', () => {
  it('redeems once, into the consent it was issued for', () => {
    const redeemed = aCode().redeem(VALID);

    expect(redeemed.ok && redeemed.value).toEqual(CONSENT_ID);
  });

  it('refuses a second redemption', () => {
    const code = aCode();
    code.redeem(VALID);

    const second = code.redeem(VALID);

    expect(!second.ok && second.error.code).toBe('INVALID_GRANT');
  });

  it('refuses a verifier that does not hash to the challenge sent before', () => {
    expect(aCode().redeem({ ...VALID, presentedChallenge: 'somebody-else' }).ok).toBe(false);
  });

  it('refuses a different client, or a different redirect', () => {
    expect(aCode().redeem({ ...VALID, clientId: 'another-client' }).ok).toBe(false);
    expect(aCode().redeem({ ...VALID, redirectUri: 'https://elsewhere.example' }).ok).toBe(false);
  });

  it('refuses a code older than five minutes', () => {
    expect(aCode().redeem({ ...VALID, moment: SIX_MINUTES_LATER }).ok).toBe(false);
  });

  it('is not spent by a failed attempt', () => {
    const code = aCode();
    code.redeem({ ...VALID, presentedChallenge: 'wrong' });

    expect(code.redeem(VALID).ok).toBe(true);
  });
});
