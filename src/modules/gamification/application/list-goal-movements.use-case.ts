import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type {
  GoalMovementDto,
  ListGoalMovementsInput,
  PageDto,
} from './dto/savings-goal.dto.js';
import { gamificationFailures } from './gamification.failures.js';
import type { SavingsGoalLedgerQuery } from './ports/savings-goal-ledger.query.port.js';
import { cursorFromDto, cursorToDto, movementFromRow } from './savings-goal-view.js';

/**
 * Every movement the user recorded against one goal, newest first. A balance
 * without its history is an assertion: somebody who logged the wrong amount
 * has nothing to check it against.
 */
export class ListGoalMovements
  implements UseCase<ListGoalMovementsInput, PageDto<GoalMovementDto>>
{
  constructor(private readonly ledger: SavingsGoalLedgerQuery) {}

  async execute(input: ListGoalMovementsInput): Promise<Result<PageDto<GoalMovementDto>, AppError>> {
    const page = await this.ledger.movementsOf(
      input.userId,
      input.goalId,
      input.limit,
      cursorFromDto(input.cursor),
    );

    if (page === null) {
      return fail(gamificationFailures.goalNotFound());
    }

    return ok({ items: page.rows.map(movementFromRow), nextCursor: cursorToDto(page.nextCursor) });
  }
}
