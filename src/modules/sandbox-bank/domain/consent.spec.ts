import { describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import {
  aConsent,
  anAccount,
  CLIENT_ID,
  CUSTOMER_ID,
  NOW,
  OTHER_CUSTOMER_ID,
} from '../testing/sandbox-bank.builders.js';
import { Consent } from './consent.js';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const LATER = new Date(NOW.getTime() + 400 * MILLISECONDS_IN_A_DAY);

function requestFor(days: number, permissions = ['ACCOUNTS_READ'] as const) {
  return Consent.request({
    id: UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77'),
    clientId: CLIENT_ID,
    permissions,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + days * MILLISECONDS_IN_A_DAY),
  });
}

describe('Consent (sandbox-bank)', () => {
  describe('a request', () => {
    it('starts awaiting authorisation, sharing nothing and belonging to nobody', () => {
      const requested = requestFor(180);

      expect(requested.ok && requested.value.status).toBe('AWAITING_AUTHORISATION');
      expect(requested.ok && requested.value.customerId).toBeNull();
      expect(requested.ok && requested.value.accountIds).toEqual([]);
    });

    it('refuses one longer than the twelve months the specification allows', () => {
      const refused = requestFor(366);

      expect(!refused.ok && refused.error.code).toBe('INVALID_CONSENT_REQUEST');
    });

    it('refuses one that has already lapsed', () => {
      expect(requestFor(0).ok).toBe(false);
    });

    it('refuses one that does not ask to read the accounts at all', () => {
      expect(requestFor(180, [] as never).ok).toBe(false);
    });
  });

  describe('authorisation', () => {
    it('shares exactly the accounts the customer picked', () => {
      const checking = anAccount();
      const consent = aConsent();

      const authorised = consent.authorise({ customerId: CUSTOMER_ID, accounts: [checking], moment: NOW });

      expect(authorised.ok).toBe(true);
      expect(consent.sharesAccountAt(checking.id, NOW)).toBe(true);
      expect(consent.sharesAccountAt(anAccount().id, NOW)).toBe(false);
    });

    it('refuses an account that belongs to somebody else', () => {
      const consent = aConsent();
      const theirs = anAccount({ customerId: OTHER_CUSTOMER_ID });

      const refused = consent.authorise({ customerId: CUSTOMER_ID, accounts: [theirs], moment: NOW });

      expect(!refused.ok && refused.error.code).toBe('ACCOUNT_NOT_OWNED');
      expect(consent.status).toBe('AWAITING_AUTHORISATION');
    });

    it('refuses to share nothing', () => {
      const refused = aConsent().authorise({ customerId: CUSTOMER_ID, accounts: [], moment: NOW });

      expect(!refused.ok && refused.error.code).toBe('NO_ACCOUNT_SELECTED');
    });

    it('cannot be authorised twice', () => {
      const consent = aConsent({ status: 'AUTHORISED', accounts: [anAccount()] });

      const refused = consent.authorise({
        customerId: CUSTOMER_ID,
        accounts: [anAccount()],
        moment: NOW,
      });

      expect(!refused.ok && refused.error.code).toBe('CONSENT_NOT_AWAITING_AUTHORISATION');
    });

    it('cannot be authorised once it has lapsed', () => {
      const refused = aConsent().authorise({
        customerId: CUSTOMER_ID,
        accounts: [anAccount()],
        moment: LATER,
      });

      expect(refused.ok).toBe(false);
    });
  });

  describe('what it shares over time', () => {
    it('stops sharing once it expires', () => {
      const account = anAccount();
      const consent = aConsent({ status: 'AUTHORISED', accounts: [account] });

      expect(consent.sharesAccountAt(account.id, LATER)).toBe(false);
    });

    it('stops sharing once revoked, and a second revocation changes nothing', () => {
      const account = anAccount();
      const consent = aConsent({ status: 'AUTHORISED', accounts: [account] });

      consent.revoke(NOW);
      consent.revoke(LATER);

      expect(consent.sharesAccountAt(account.id, NOW)).toBe(false);
      expect(consent.statusUpdatedAt).toEqual(NOW);
    });

    it('shares nothing after the customer said no', () => {
      const consent = aConsent();

      expect(consent.reject(NOW).ok).toBe(true);
      expect(consent.status).toBe('REJECTED');
      expect(consent.isActiveAt(NOW)).toBe(false);
    });
  });
});
