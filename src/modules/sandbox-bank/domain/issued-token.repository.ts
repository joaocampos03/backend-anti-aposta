import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { IssuedToken } from './issued-token.js';

export interface IssuedTokenRepository {
  save(token: IssuedToken): Promise<void>;
  findByFingerprint(tokenFingerprint: string): Promise<IssuedToken | null>;
  /** Revoking a consent revokes every token it ever produced. */
  revokeAllForConsent(consentId: UniqueEntityId, moment: Date): Promise<void>;
}
