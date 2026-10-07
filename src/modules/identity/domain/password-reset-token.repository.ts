import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PasswordResetToken } from './password-reset-token.js';

export interface PasswordResetTokenRepository {
  save(token: PasswordResetToken): Promise<void>;
  findByTokenFingerprint(tokenFingerprint: string): Promise<PasswordResetToken | null>;
  /** Everything still outstanding for this user, so a password change can end it. */
  findPendingByUserId(userId: UniqueEntityId): Promise<readonly PasswordResetToken[]>;
}
