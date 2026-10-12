import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { AuthorisationRequest } from './authorisation-request.js';

export interface AuthorisationRequestRepository {
  save(request: AuthorisationRequest): Promise<void>;
  findByConsentIdAndUserId(
    consentId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<AuthorisationRequest | null>;
  /** Single use: gone once the callback has been answered, either way. */
  delete(consentId: UniqueEntityId): Promise<void>;
  deleteAllForUser(userId: UniqueEntityId): Promise<void>;
}
