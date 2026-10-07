/**
 * Mints the opaque session token and derives the fingerprint stored in its
 * place. The token is returned to the Next.js server once and never persisted.
 */
export interface SessionTokenGenerator {
  generate(): string;
  fingerprint(token: string): string;
}
