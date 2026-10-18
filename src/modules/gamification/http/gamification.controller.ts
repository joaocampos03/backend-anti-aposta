import type { RequestHandler, Response } from 'express';
import type { AppError } from '@shared/application/app-error.js';
import type { Result } from '@shared/domain/result.js';
import { callerOf } from '@shared/http/require-session.js';
import type { ValidatedBody, ValidatedInput } from '@shared/http/validate.js';
import type { CreateSavingsGoal } from '../application/create-savings-goal.use-case.js';
import type { DescribeAchievements } from '../application/describe-achievements.use-case.js';
import type { DescribeBettingCeiling } from '../application/describe-betting-ceiling.use-case.js';
import type { ListGoalMovements } from '../application/list-goal-movements.use-case.js';
import type { ListSavingsGoals } from '../application/list-savings-goals.use-case.js';
import type { RecordGoalMovement } from '../application/record-goal-movement.use-case.js';
import type { SetBettingCeiling } from '../application/set-betting-ceiling.use-case.js';
import { GamificationPresenter } from './gamification.presenter.js';
import type {
  CreateSavingsGoalBody,
  GoalIdParams,
  IdempotencyHeaders,
  PageQuery,
  RecordMovementBody,
  SetBettingCeilingBody,
} from './gamification.schemas.js';

const OK = 200;
const CREATED = 201;

export interface GamificationUseCases {
  readonly createSavingsGoal: CreateSavingsGoal;
  readonly listSavingsGoals: ListSavingsGoals;
  readonly listGoalMovements: ListGoalMovements;
  readonly recordGoalMovement: RecordGoalMovement;
  readonly describeBettingCeiling: DescribeBettingCeiling;
  readonly setBettingCeiling: SetBettingCeiling;
  readonly describeAchievements: DescribeAchievements;
}

export interface GamificationInputs {
  readonly createSavingsGoalBody: ValidatedBody<CreateSavingsGoalBody>;
  readonly recordMovementBody: ValidatedBody<RecordMovementBody>;
  readonly setBettingCeilingBody: ValidatedBody<SetBettingCeilingBody>;
  readonly goalIdParams: ValidatedInput<GoalIdParams>;
  readonly pageQuery: ValidatedInput<PageQuery>;
  readonly idempotencyHeaders: ValidatedInput<IdempotencyHeaders>;
}

/** Answers a use case's result, or hands its refusal to the error funnel. */
function respond<TValue>(
  response: Response,
  next: (cause: AppError) => void,
  result: Result<TValue, AppError>,
  present: (value: TValue) => { status: number; body: unknown },
): void {
  if (!result.ok) {
    next(result.error);

    return;
  }

  const { status, body } = present(result.value);
  response.status(status).json(body);
}

export class GamificationController {
  constructor(
    private readonly useCases: GamificationUseCases,
    private readonly inputs: GamificationInputs,
  ) {}

  readonly listSavingsGoals: RequestHandler = async (request, response, next) => {
    const query = this.inputs.pageQuery.read(request);
    const result = await this.useCases.listSavingsGoals.execute({
      userId: callerOf(response),
      limit: query.limit,
      cursor: query.cursor ?? null,
    });

    respond(response, next, result, (page) => ({ status: OK, body: GamificationPresenter.savingsGoals(page) }));
  };

  readonly createSavingsGoal: RequestHandler = async (request, response, next) => {
    const body = this.inputs.createSavingsGoalBody.read(request);
    const result = await this.useCases.createSavingsGoal.execute({
      userId: callerOf(response),
      title: body.title,
      purpose: body.purpose,
      targetInCents: body.target.amountInCents,
    });

    respond(response, next, result, (goal) => ({ status: CREATED, body: GamificationPresenter.savingsGoal(goal) }));
  };

  readonly listGoalMovements: RequestHandler = async (request, response, next) => {
    const query = this.inputs.pageQuery.read(request);
    const result = await this.useCases.listGoalMovements.execute({
      userId: callerOf(response),
      goalId: this.inputs.goalIdParams.read(request).goalId,
      limit: query.limit,
      cursor: query.cursor ?? null,
    });

    respond(response, next, result, (page) => ({ status: OK, body: GamificationPresenter.movements(page) }));
  };

  readonly recordGoalMovement: RequestHandler = async (request, response, next) => {
    const body = this.inputs.recordMovementBody.read(request);
    const result = await this.useCases.recordGoalMovement.execute({
      userId: callerOf(response),
      goalId: this.inputs.goalIdParams.read(request).goalId,
      direction: body.direction,
      amountInCents: body.amount.amountInCents,
      idempotencyKey: this.inputs.idempotencyHeaders.read(request)['idempotency-key'] ?? null,
    });

    respond(response, next, result, (recorded) => ({
      status: CREATED,
      body: GamificationPresenter.recordedMovement(recorded),
    }));
  };

  readonly describeBettingCeiling: RequestHandler = async (_request, response, next) => {
    const result = await this.useCases.describeBettingCeiling.execute({ userId: callerOf(response) });

    respond(response, next, result, (overview) => ({
      status: OK,
      body: GamificationPresenter.ceilingOverview(overview),
    }));
  };

  readonly describeAchievements: RequestHandler = async (_request, response, next) => {
    const result = await this.useCases.describeAchievements.execute({ userId: callerOf(response) });

    respond(response, next, result, (output) => ({
      status: OK,
      body: GamificationPresenter.achievements(output),
    }));
  };

  readonly setBettingCeiling: RequestHandler = async (request, response, next) => {
    const body = this.inputs.setBettingCeilingBody.read(request);
    const result = await this.useCases.setBettingCeiling.execute({
      userId: callerOf(response),
      amountInCents: body.amount.amountInCents,
      destination: body.destination ?? null,
    });

    respond(response, next, result, (choice) => ({
      status: OK,
      body: GamificationPresenter.ceilingChoice(choice),
    }));
  };
}
