/**
 * The one thing `identity` asks `open-finance`: does this user have an Open
 * Finance consent in `AUTHORISED`? It is a synchronous query the caller cannot
 * proceed without — every authenticated page needs the flag — and it is answered
 * through `open-finance`'s public API, never by joining its tables.
 */
export interface AuthorisedConsentLookup {
  hasAuthorisedConsent(userId: string): Promise<boolean>;
}
