import { createHash, randomBytes } from 'node:crypto';
import type { AuthorisationSecrets } from '../application/ports/authorisation-secrets.port.js';

const STATE_BYTE_LENGTH = 32;
/** 32 bytes base64url-encode to 43 characters: RFC 7636's minimum, at full entropy. */
const VERIFIER_BYTE_LENGTH = 32;

export class CryptoAuthorisationSecrets implements AuthorisationSecrets {
  generateState(): string {
    return randomBytes(STATE_BYTE_LENGTH).toString('base64url');
  }

  generateCodeVerifier(): string {
    return randomBytes(VERIFIER_BYTE_LENGTH).toString('base64url');
  }

  challengeOf(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  }

  fingerprint(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
