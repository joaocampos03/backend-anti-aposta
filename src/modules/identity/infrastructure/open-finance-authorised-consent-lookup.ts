import type { AuthorisedConsentPresence } from '@modules/open-finance/index.js';
import type { AuthorisedConsentLookup } from '../application/ports/authorised-consent-lookup.port.js';

/**
 * The anti-corruption layer between `identity` and `open-finance`: identity
 * depends on its own port, and this adapter is the single place that knows the
 * other context's published contract.
 */
export class OpenFinanceAuthorisedConsentLookup implements AuthorisedConsentLookup {
  constructor(private readonly consents: AuthorisedConsentPresence) {}

  async hasAuthorisedConsent(userId: string): Promise<boolean> {
    return await this.consents.hasAuthorisedConsent(userId);
  }
}
