import type { ClassificationOutput } from '../application/dto/override.dto.js';

export class BetDetectionPresenter {
  static classification(output: ClassificationOutput): unknown {
    return {
      transaction: {
        id: output.transaction.id,
        bet: output.transaction.bet,
        yieldEquivalent: output.transaction.yieldEquivalent,
      },
      override: output.override,
    };
  }
}
