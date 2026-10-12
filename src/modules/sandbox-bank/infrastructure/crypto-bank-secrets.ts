import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { BankSecrets } from '../application/ports/bank-secrets.port.js';

const OPAQUE_BYTE_LENGTH = 32;
const DECIMAL_BASE = 10;

export class CryptoBankSecrets implements BankSecrets {
  mint(): string {
    return randomBytes(OPAQUE_BYTE_LENGTH).toString('base64url');
  }

  fingerprint(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  challengeOf(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  }

  digits(length: number): string {
    return Array.from({ length }, () => String(randomInt(DECIMAL_BASE))).join('');
  }
}
