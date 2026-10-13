/**
 * A DataRecipient the bank has enrolled. In the real ecosystem that is the
 * directory of participants plus a certificate; here it is one client, read
 * from the environment.
 */
export interface RegisteredClient {
  readonly clientId: string;
  /** What the authorisation screen calls the platform asking for the data. */
  readonly displayName: string;
  /** The only redirect the bank will send a code to. Exact match, no prefixes. */
  readonly redirectUri: string;
  /** Where the bank says "this consent's resources changed". Enrolled, like the redirect. */
  readonly noticeUri: string;
}

export interface ClientRegistry {
  /** Constant time in the secret: a near miss takes as long as a wild guess. */
  authenticate(clientId: string, clientSecret: string): RegisteredClient | null;
  findById(clientId: string): RegisteredClient | null;
}
