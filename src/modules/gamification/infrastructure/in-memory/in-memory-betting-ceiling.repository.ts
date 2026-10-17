import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BettingCeiling } from '../../domain/betting-ceiling.js';
import type { BettingCeilingRepository } from '../../domain/betting-ceiling.repository.js';
import { ConcurrentModificationError } from '../../domain/gamification.errors.js';

export class InMemoryBettingCeilingRepository implements BettingCeilingRepository {
  readonly ceilings: BettingCeiling[] = [];
  /** Makes the next save lose the race, as a second request would make it. */
  conflictOnNextSave = false;

  async save(ceiling: BettingCeiling): Promise<void> {
    if (this.conflictOnNextSave) {
      this.conflictOnNextSave = false;

      throw new ConcurrentModificationError();
    }

    if (!this.ceilings.some((stored) => stored.equals(ceiling))) {
      this.ceilings.push(ceiling);
    }
  }

  async findByUserId(userId: UniqueEntityId): Promise<BettingCeiling | null> {
    return this.ceilings.find((ceiling) => ceiling.userId.equals(userId)) ?? null;
  }
}
