import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { AuthorisationRequest } from './authorisation-request.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const ELEVEN_MINUTES_LATER = new Date(NOW.getTime() + 11 * 60 * 1000);

function aRequest(): AuthorisationRequest {
  return AuthorisationRequest.open({
    consentId: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77'),
    userId: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001'),
    stateFingerprint: 'fingerprint-of-the-state',
    codeVerifier: 'verifier',
    createdAt: NOW,
  });
}

describe('AuthorisationRequest', () => {
  it('accepts the callback that brings its own state back', () => {
    expect(aRequest().verify('fingerprint-of-the-state', NOW).ok).toBe(true);
  });

  it('refuses a callback carrying any other state', () => {
    const refused = aRequest().verify('fingerprint-of-something-else', NOW);

    expect(!refused.ok && refused.error.code).toBe('AUTHORISATION_STATE_MISMATCH');
  });

  it('refuses a callback that arrives after ten minutes', () => {
    const refused = aRequest().verify('fingerprint-of-the-state', ELEVEN_MINUTES_LATER);

    expect(!refused.ok && refused.error.code).toBe('AUTHORISATION_EXPIRED');
  });
});
