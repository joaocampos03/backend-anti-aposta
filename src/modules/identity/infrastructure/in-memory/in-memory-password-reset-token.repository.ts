import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { PasswordResetToken } from '../../domain/password-reset-token.js';
import type { PasswordResetTokenRepository } from '../../domain/password-reset-token.repository.js';

export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  readonly tokens: PasswordResetToken[] = [];

  async save(token: PasswordResetToken): Promise<void> {
    const index = this.tokens.findIndex((stored) => stored.id.equals(token.id));

    if (index >= 0) {
      this.tokens.splice(index, 1, token);

      return;
    }

    this.tokens.push(token);
  }

  async findByTokenFingerprint(tokenFingerprint: string): Promise<PasswordResetToken | null> {
    return this.tokens.find((stored) => stored.tokenFingerprint === tokenFingerprint) ?? null;
  }

  async findPendingByUserId(userId: UniqueEntityId): Promise<readonly PasswordResetToken[]> {
    return this.tokens.filter(
      (stored) => stored.userId.equals(userId) && stored.consumedAt === null,
    );
  }
}
