import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BadgeCollectionRepository } from '../domain/badge-collection.repository.js';
import type { AchievementsInput } from './dto/achievements.dto.js';

/**
 * Reaction to `ConsentRevoked`. Revocation deletes the derived data, not just the
 * token (LGPD art. 18), and a badge measured in the shared statement is derived
 * from it. Savings badges stay: they come from what the person recorded here.
 * Idempotent — a second delivery finds nothing measured left to forget.
 */
export class ForgetMeasuredBadges implements UseCase<AchievementsInput, void> {
  constructor(private readonly collections: BadgeCollectionRepository) {}

  async execute(input: AchievementsInput): Promise<Result<void, AppError>> {
    const collection = await this.collections.findByUserId(UniqueEntityId.restore(input.userId));

    if (collection === null || collection.forgetMeasured() === 0) {
      return ok(undefined);
    }

    await this.collections.save(collection);

    return ok(undefined);
  }
}
