import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmTokenCipher } from './aes-gcm-token-cipher.js';

const KEY = randomBytes(32).toString('base64');

describe('AesGcmTokenCipher', () => {
  it('round-trips a token', () => {
    const cipher = new AesGcmTokenCipher(KEY);

    expect(cipher.decrypt(cipher.encrypt('an-access-token'))).toBe('an-access-token');
  });

  it('never stores the token in clear, and never the same ciphertext twice', () => {
    const cipher = new AesGcmTokenCipher(KEY);
    const first = cipher.encrypt('an-access-token');

    expect(first).not.toContain('an-access-token');
    expect(cipher.encrypt('an-access-token')).not.toBe(first);
  });

  it('refuses a ciphertext that was tampered with', () => {
    const cipher = new AesGcmTokenCipher(KEY);
    const sealed = cipher.encrypt('an-access-token');
    const tampered = `${sealed.slice(0, -4)}AAAA`;

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('refuses to decrypt under another key', () => {
    const sealed = new AesGcmTokenCipher(KEY).encrypt('an-access-token');
    const other = new AesGcmTokenCipher(randomBytes(32).toString('base64'));

    expect(() => other.decrypt(sealed)).toThrow();
  });

  it('refuses a key that is not 32 bytes, at construction', () => {
    expect(() => new AesGcmTokenCipher(randomBytes(16).toString('base64'))).toThrow();
  });
});
