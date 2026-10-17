import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import type { PageDto, PageRequest, SavingsGoalDto } from './dto/savings-goal.dto.js';
import type { SavingsGoalLedgerQuery } from './ports/savings-goal-ledger.query.port.js';
import { cursorFromDto, cursorToDto, savingsGoalFromRow } from './savings-goal-view.js';

/** The caller's savings goals, newest first, each with its balance summed from its movements. */
export class ListSavingsGoals implements UseCase<PageRequest, PageDto<SavingsGoalDto>> {
  constructor(private readonly ledger: SavingsGoalLedgerQuery) {}

  async execute(input: PageRequest): Promise<Result<PageDto<SavingsGoalDto>, AppError>> {
    const page = await this.ledger.goalsOf(input.userId, input.limit, cursorFromDto(input.cursor));

    return ok({ items: page.rows.map(savingsGoalFromRow), nextCursor: cursorToDto(page.nextCursor) });
  }
}
