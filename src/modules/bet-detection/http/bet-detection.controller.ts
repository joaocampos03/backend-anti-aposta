import type { RequestHandler } from 'express';
import { callerOf } from '@shared/http/require-session.js';
import type { ValidatedBody, ValidatedInput } from '@shared/http/validate.js';
import type { ReclassifyTransaction } from '../application/reclassify-transaction.use-case.js';
import type { RevertReclassification } from '../application/revert-reclassification.use-case.js';
import { BetDetectionPresenter } from './bet-detection.presenter.js';
import type {
  ClassificationOverrideBody,
  TransactionIdParams,
} from './bet-detection.schemas.js';

const OK = 200;

export class BetDetectionController {
  constructor(
    private readonly reclassifyTransaction: ReclassifyTransaction,
    private readonly revertReclassification: RevertReclassification,
    private readonly overrideBody: ValidatedBody<ClassificationOverrideBody>,
    private readonly transactionIdParams: ValidatedInput<TransactionIdParams>,
  ) {}

  readonly override: RequestHandler = async (request, response, next) => {
    const body = this.overrideBody.read(request);

    const result = await this.reclassifyTransaction.execute({
      userId: callerOf(response),
      transactionId: this.transactionIdParams.read(request).transactionId,
      reason: body.reason,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(BetDetectionPresenter.classification(result.value));
  };

  readonly revert: RequestHandler = async (request, response, next) => {
    const result = await this.revertReclassification.execute({
      userId: callerOf(response),
      transactionId: this.transactionIdParams.read(request).transactionId,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(BetDetectionPresenter.classification(result.value));
  };
}
