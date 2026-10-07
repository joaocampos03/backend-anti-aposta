import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Session } from '../../domain/session.js';
import type { SessionRepository } from '../../domain/session.repository.js';

export class InMemorySessionRepository implements SessionRepository {
  readonly sessions: Session[] = [];

  async save(session: Session): Promise<void> {
    const index = this.sessions.findIndex((stored) => stored.id.equals(session.id));

    if (index >= 0) {
      this.sessions.splice(index, 1, session);

      return;
    }

    this.sessions.push(session);
  }

  async findByTokenFingerprint(tokenFingerprint: string): Promise<Session | null> {
    return this.sessions.find((stored) => stored.tokenFingerprint === tokenFingerprint) ?? null;
  }

  async findActiveByUserId(userId: UniqueEntityId): Promise<readonly Session[]> {
    return this.sessions.filter(
      (stored) => stored.userId.equals(userId) && stored.revokedAt === null,
    );
  }
}
