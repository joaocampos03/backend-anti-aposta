import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { ConsentTokenVault } from '../application/ports/consent-token-vault.port.js';
import type { DataHolderTokens } from '../application/ports/data-holder.port.js';
import type { AesGcmTokenCipher } from './aes-gcm-token-cipher.js';

/**
 * The DataHolder's tokens, encrypted at rest with AES-256-GCM. A database dump
 * yields ciphertext; the key lives in the environment and nowhere else.
 */
export class PrismaConsentTokenVault implements ConsentTokenVault {
  constructor(
    private readonly client: PrismaTransactionClient,
    private readonly cipher: AesGcmTokenCipher,
  ) {}

  async store(input: {
    readonly consentId: string;
    readonly userId: string;
    readonly tokens: DataHolderTokens;
  }): Promise<void> {
    const row = {
      consentId: input.consentId,
      userId: input.userId,
      accessTokenCiphertext: this.cipher.encrypt(input.tokens.accessToken),
      refreshTokenCiphertext: this.cipher.encrypt(input.tokens.refreshToken),
      accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
    };

    await this.client.consentToken.upsert({
      where: { consentId: input.consentId },
      create: row,
      update: row,
    });
  }

  async find(consentId: string): Promise<DataHolderTokens | null> {
    const row = await this.client.consentToken.findUnique({ where: { consentId } });

    if (row === null) {
      return null;
    }

    return {
      accessToken: this.cipher.decrypt(row.accessTokenCiphertext),
      refreshToken: this.cipher.decrypt(row.refreshTokenCiphertext),
      accessTokenExpiresAt: row.accessTokenExpiresAt,
    };
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.client.consentToken.deleteMany({ where: { userId } });
  }
}
