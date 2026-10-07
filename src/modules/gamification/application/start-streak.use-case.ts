import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { StreakRepository } from '../domain/streak.repository.js';
import { Streak } from '../domain/streak.js';

export interface StartStreakInput {
  readonly userId: string;
}

/**
 * Reaction to `UserRegistered`. Idempotent: the same event delivered twice
 * leaves the same single streak, at zero days.
 */
export class StartStreak implements UseCase<StartStreakInput, void> {
  constructor(
    private readonly streaks: StreakRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: StartStreakInput): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);
    const existing = await this.streaks.findByUserId(userId);

    if (existing !== null) {
      return ok(undefined);
    }

    await this.streaks.save(
      Streak.start({ id: this.idGenerator.generate(), userId, startedAt: this.clock.now() }),
    );

    return ok(undefined);
  }
}
