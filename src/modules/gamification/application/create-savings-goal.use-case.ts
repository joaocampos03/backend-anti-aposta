import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { GoalAmount } from '../domain/goal-amount.js';
import { GoalTitle } from '../domain/goal-title.js';
import { SavingsGoal } from '../domain/savings-goal.js';
import type { SavingsGoalRepository } from '../domain/savings-goal.repository.js';
import type { CreateSavingsGoalInput, SavingsGoalDto } from './dto/savings-goal.dto.js';
import { gamificationFailures } from './gamification.failures.js';
import { savingsGoalFromAggregate } from './savings-goal-view.js';

/**
 * A new savings goal: the name, the purpose and the target are the user's, and
 * we suggest none of them. It starts empty — the first deposit is something the
 * user records, never something we assume.
 */
export class CreateSavingsGoal implements UseCase<CreateSavingsGoalInput, SavingsGoalDto> {
  constructor(
    private readonly goals: SavingsGoalRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateSavingsGoalInput): Promise<Result<SavingsGoalDto, AppError>> {
    const title = GoalTitle.create(input.title);

    if (!title.ok) {
      return fail(gamificationFailures.invalidField('title', title.error.code));
    }

    const target = GoalAmount.fromCents(input.targetInCents);

    if (!target.ok) {
      return fail(gamificationFailures.invalidField('target.amountInCents', target.error.code));
    }

    const goal = SavingsGoal.create({
      id: this.idGenerator.generate(),
      userId: UniqueEntityId.restore(input.userId),
      title: title.value,
      purpose: input.purpose,
      target: target.value,
      createdAt: this.clock.now(),
    });

    await this.goals.save(goal);

    return ok(savingsGoalFromAggregate(goal));
  }
}
