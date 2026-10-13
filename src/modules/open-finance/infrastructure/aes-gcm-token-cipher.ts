import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTE_LENGTH = 32;
/** 96 bits: the IV length GCM is specified for. */
const IV_BYTE_LENGTH = 12;
const TAG_BYTE_LENGTH = 16;
/** Lets a key or format rotation tell old ciphertexts from new ones. */
const FORMAT_PREFIX = 'v1.';

/**
 * AES-256-GCM for the third-party credentials this context holds — the
 * DataHolder's tokens and the PKCE verifier. A fresh IV per value; the auth tag
 * makes a tampered row fail to decrypt rather than decrypt to garbage.
 *
 * The only place these values exist in clear is in memory, in this layer.
 */
export class AesGcmTokenCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');

    if (key.length !== KEY_BYTE_LENGTH) {
      throw new Error('The Open Finance token key must be 32 bytes, base64-encoded');
    }

    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTE_LENGTH });
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return `${FORMAT_PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
  }

  decrypt(sealed: string): string {
    if (!sealed.startsWith(FORMAT_PREFIX)) {
      throw new Error('Unrecognised token ciphertext format');
    }

    const packed = Buffer.from(sealed.slice(FORMAT_PREFIX.length), 'base64');
    const iv = packed.subarray(0, IV_BYTE_LENGTH);
    const tag = packed.subarray(IV_BYTE_LENGTH, IV_BYTE_LENGTH + TAG_BYTE_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTE_LENGTH });
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(packed.subarray(IV_BYTE_LENGTH + TAG_BYTE_LENGTH)),
      decipher.final(),
    ]).toString('utf8');
  }
}
