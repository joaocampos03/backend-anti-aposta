import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import type { AchievementsEvaluation } from './achievements-evaluation.js';
import type { BadgeAwarding } from './badge-awarding.js';
import type { AchievementsInput } from './dto/achievements.dto.js';

/**
 * Reaction to anything that can move a badge's figure: new transactions, a
 * corrected classification, a savings goal reached. Idempotent — the same event
 * delivered twice finds the badges already held and awards nothing.
 */
export class EvaluateBadges implements UseCase<AchievementsInput, void> {
  constructor(
    private readonly evaluation: AchievementsEvaluation,
    private readonly awarding: BadgeAwarding,
  ) {}

  async execute(input: AchievementsInput): Promise<Result<void, AppError>> {
    const measurement = await this.evaluation.measure(input.userId);
    await this.awarding.awardDue(input.userId, measurement.attainments);

    return ok(undefined);
  }
}
