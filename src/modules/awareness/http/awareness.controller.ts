import type { RequestHandler } from 'express';
import { callerOf } from '@shared/http/require-session.js';
import type { EvaluateSupportOffer } from '../application/evaluate-support-offer.use-case.js';

const OK = 200;

export class AwarenessController {
  constructor(private readonly evaluateSupportOffer: EvaluateSupportOffer) {}

  /**
   * It takes no window and no filter: whether somebody is shown a crisis line
   * cannot depend on which chart option they happen to have selected.
   */
  readonly supportOffer: RequestHandler = async (_request, response, next) => {
    const result = await this.evaluateSupportOffer.execute({ userId: callerOf(response) });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json({
      shouldOffer: result.value.shouldOffer,
      sustainedMonths: result.value.sustainedMonths,
      isRising: result.value.isRising,
      thresholdInCents: result.value.thresholdInCents,
    });
  };
}
