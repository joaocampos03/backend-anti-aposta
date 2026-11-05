import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { BadgeCollectionRepository } from '../domain/badge-collection.repository.js';
import type { BettingCeilingRepository } from '../domain/betting-ceiling.repository.js';
import type { SavingsGoalRepository } from '../domain/savings-goal.repository.js';

export interface ForgetGamificationAccountInput {
  readonly userId: string;
}

/**
 * The end of an account. Unlike a revocation, which keeps what the person
 * recorded here, this takes the savings goals and their badges too: nobody is
 * left to read them. Idempotent.
 */
export class ForgetGamificationAccount implements UseCase<
  ForgetGamificationAccountInput,
  void
> {
  constructor(
    private readonly collections: BadgeCollectionRepository,
    private readonly goals: SavingsGoalRepository,
    private readonly ceilings: BettingCeilingRepository,
  ) {}

  async execute(
    input: ForgetGamificationAccountInput,
  ): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);

    await this.collections.deleteAllForUser(userId);
    await this.goals.deleteAllForUser(userId);
    await this.ceilings.deleteAllForUser(userId);

    return ok(undefined);
  }
}
