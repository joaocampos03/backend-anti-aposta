import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Session } from './session.js';

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findByTokenFingerprint(tokenFingerprint: string): Promise<Session | null>;
  /** Every session a password change has to end, this user's own included. */
  findActiveByUserId(userId: UniqueEntityId): Promise<readonly Session[]>;
}
