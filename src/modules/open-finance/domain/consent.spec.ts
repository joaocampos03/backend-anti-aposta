import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Consent, type ConsentStatus } from './consent.js';
import { ConsentRevoked } from './events/consent-revoked.js';

const CONSENT_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77');
const USER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
const NOW = new Date('2026-10-11T15:00:00.000Z');
const LATER = new Date('2027-10-11T15:00:00.000Z');

function aConsent(status: ConsentStatus = 'AUTHORISED', lastSyncedAt: Date | null = NOW): Consent {
  return Consent.restore(CONSENT_ID, {
    userId: USER_ID,
    status,
    createdAt: NOW,
    expiresAt: new Date('2027-04-11T15:00:00.000Z'),
    lastSyncedAt,
  });
}

describe('Consent', () => {
  describe('the gate every ingestion passes through', () => {
    it('lets an authorised consent through', () => {
      expect(aConsent().authoriseIngestionAt(NOW).ok).toBe(true);
    });

    it('refuses one that was never authorised', () => {
      const refused = aConsent('AWAITING_AUTHORISATION').authoriseIngestionAt(NOW);

      expect(!refused.ok && refused.error.code).toBe('CONSENT_NOT_AUTHORISED');
    });

    it('refuses one that has expired, exactly as one that was refused', () => {
      const lapsed = aConsent().authoriseIngestionAt(LATER);

      expect(!lapsed.ok && lapsed.error.code).toBe('CONSENT_NOT_AUTHORISED');
    });

    it('refuses one that was revoked', () => {
      const consent = aConsent();
      consent.revoke(NOW);

      expect(consent.authoriseIngestionAt(NOW).ok).toBe(false);
    });
  });

  describe('the status the screens read', () => {
    it('says NO_CONSENT when nothing is authorised', () => {
      expect(aConsent('REJECTED').syncStatusAt(NOW)).toBe('NO_CONSENT');
    });

    it('says SYNCING while the first ingestion has not finished', () => {
      expect(aConsent('AUTHORISED', null).syncStatusAt(NOW)).toBe('SYNCING');
    });

    it('says READY once something has been synced', () => {
      expect(aConsent().syncStatusAt(NOW)).toBe('READY');
    });

    it('returns to NO_CONSENT after revocation', () => {
      const consent = aConsent();
      consent.revoke(NOW);

      expect(consent.syncStatusAt(NOW)).toBe('NO_CONSENT');
    });

    it('says NO_CONSENT once the consent has lapsed', () => {
      expect(aConsent().syncStatusAt(LATER)).toBe('NO_CONSENT');
    });
  });

  describe('revoking', () => {
    it('records the event whose subscriber deletes the derived data', () => {
      const consent = aConsent();
      consent.revoke(NOW);

      const [event] = consent.pullEvents();

      expect(event).toBeInstanceOf(ConsentRevoked);
      expect(event?.payload).toEqual({
        userId: USER_ID.value,
        consentId: CONSENT_ID.value,
        revokedAt: '2026-10-11T15:00:00.000Z',
      });
    });

    it('is idempotent, and records nothing the second time', () => {
      const consent = aConsent();
      consent.revoke(NOW);
      consent.pullEvents();
      consent.revoke(NOW);

      expect(consent.pullEvents()).toHaveLength(0);
    });
  });
});
