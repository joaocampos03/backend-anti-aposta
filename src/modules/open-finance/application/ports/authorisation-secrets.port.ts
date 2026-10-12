/** The cryptography the OAuth client side needs, behind a port. */
export interface AuthorisationSecrets {
  /** Unguessable, single use: binds the callback to the request that sent the person away. */
  generateState(): string;
  /** RFC 7636: 43 to 128 characters of high entropy. */
  generateCodeVerifier(): string;
  /** RFC 7636 S256: `BASE64URL(SHA256(verifier))`. */
  challengeOf(codeVerifier: string): string;
  /** What is stored in place of the `state` itself. */
  fingerprint(value: string): string;
}
