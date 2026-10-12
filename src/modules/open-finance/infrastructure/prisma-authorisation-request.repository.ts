import type { AuthorisationRequest as AuthorisationRequestRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import { AuthorisationRequest } from '../domain/authorisation-request.js';
import type { AuthorisationRequestRepository } from '../domain/authorisation-request.repository.js';
import type { AesGcmTokenCipher } from './aes-gcm-token-cipher.js';

/** The PKCE verifier is encrypted on the way in and decrypted on the way out, here and only here. */
export class PrismaAuthorisationRequestRepository implements AuthorisationRequestRepository {
  constructor(
    private readonly client: PrismaTransactionClient,
    private readonly cipher: AesGcmTokenCipher,
  ) {}

  async save(request: AuthorisationRequest): Promise<void> {
    const row = this.toRow(request);

    await this.client.authorisationRequest.upsert({
      where: { consentId: row.consentId },
      create: row,
      update: row,
    });
  }

  async findByConsentIdAndUserId(
    consentId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<AuthorisationRequest | null> {
    const row = await this.client.authorisationRequest.findFirst({
      where: { consentId: consentId.value, userId: userId.value },
    });

    return row === null ? null : this.toDomain(row);
  }

  async delete(consentId: UniqueEntityId): Promise<void> {
    await this.client.authorisationRequest.deleteMany({ where: { consentId: consentId.value } });
  }

  async deleteAllForUser(userId: UniqueEntityId): Promise<void> {
    await this.client.authorisationRequest.deleteMany({ where: { userId: userId.value } });
  }

  private toRow(request: AuthorisationRequest): AuthorisationRequestRow {
    return {
      consentId: request.consentId.value,
      userId: request.userId.value,
      stateFingerprint: request.stateFingerprint,
      codeVerifierCiphertext: this.cipher.encrypt(request.codeVerifier),
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    };
  }

  private toDomain(row: AuthorisationRequestRow): AuthorisationRequest {
    return AuthorisationRequest.restore(UniqueEntityId.restore(row.consentId), {
      userId: UniqueEntityId.restore(row.userId),
      stateFingerprint: row.stateFingerprint,
      codeVerifier: this.cipher.decrypt(row.codeVerifierCiphertext),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    });
  }
}
