/**
 * The narrow contract `open-finance` publishes for the rest of the monolith: has
 * this user an Open Finance consent in `AUTHORISED` right now? It is answered
 * from the `Consent` aggregate's own state, never from whether a transaction
 * happens to exist.
 */
export interface AuthorisedConsentPresence {
  hasAuthorisedConsent(userId: string): Promise<boolean>;
}
