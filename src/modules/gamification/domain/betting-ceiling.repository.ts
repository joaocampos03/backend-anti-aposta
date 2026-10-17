import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BettingCeiling } from './betting-ceiling.js';

export interface BettingCeilingRepository {
  /**
   * Inserts, or replaces the terms under optimistic locking. Throws
   * `ConcurrentModificationError` when another request changed it first —
   * including two first ceilings racing for the same user.
   */
  save(ceiling: BettingCeiling): Promise<void>;
  findByUserId(userId: UniqueEntityId): Promise<BettingCeiling | null>;
}
