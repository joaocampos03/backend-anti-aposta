import { createHash, randomBytes } from 'node:crypto';
import type { SessionTokenGenerator } from '../application/ports/session-token-generator.port.js';

const TOKEN_BYTE_LENGTH = 16;
const TOKEN_PREFIX = 'op_';

/**
 * The token is opaque: it carries no claims and means nothing outside this
 * database. Only its SHA-256 is stored, so a leaked row cannot be replayed.
 */
export class CryptoSessionTokenGenerator implements SessionTokenGenerator {
  generate(): string {
    return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTE_LENGTH).toString('hex')}`;
  }

  fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
