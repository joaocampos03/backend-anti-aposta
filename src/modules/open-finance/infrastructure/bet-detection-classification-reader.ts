import type { ClassificationLookup } from '@modules/bet-detection/index.js';
import type {
  ClassificationReader,
  ProjectedVerdict,
} from '../application/ports/classification-reader.port.js';

/** The seam between `open-finance` and `bet-detection`, in one direction. */
export class BetDetectionClassificationReader implements ClassificationReader {
  constructor(private readonly lookup: ClassificationLookup) {}

  async effectiveFor(transactionId: string, userId: string): Promise<ProjectedVerdict | null> {
    const found = await this.lookup.effectiveFor(transactionId, userId);

    if (found === null) {
      return null;
    }

    return { bet: found.bet, overriddenAt: found.overriddenAt };
  }
}
