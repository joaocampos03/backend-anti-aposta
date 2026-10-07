import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BadgeCollection } from '../domain/badge-collection.js';
import type { BadgeCollectionRepository } from '../domain/badge-collection.repository.js';

export interface CreateBadgeCollectionInput {
  readonly userId: string;
}

/** Reaction to `UserRegistered`. Idempotent, and awards nothing. */
export class CreateBadgeCollection implements UseCase<CreateBadgeCollectionInput, void> {
  constructor(
    private readonly collections: BadgeCollectionRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateBadgeCollectionInput): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);
    const existing = await this.collections.findByUserId(userId);

    if (existing !== null) {
      return ok(undefined);
    }

    await this.collections.save(
      BadgeCollection.empty({
        id: this.idGenerator.generate(),
        userId,
        createdAt: this.clock.now(),
      }),
    );

    return ok(undefined);
  }
}
