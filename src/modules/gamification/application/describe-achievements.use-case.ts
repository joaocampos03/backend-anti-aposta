import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import type { AchievementsEvaluation } from './achievements-evaluation.js';
import { badgesToDto, streakToDto } from './achievements-view.js';
import type { BadgeAwarding } from './badge-awarding.js';
import type { AchievementsInput, AchievementsOutput } from './dto/achievements.dto.js';

/**
 * Everything the Conquistas screen shows, measured on read.
 *
 * Reading also **awards**: a streak badge can fall due only because a day
 * passed, and no event marks that, so the first read after it awards it. The
 * award is idempotent — a second read finds it held and awards nothing — and
 * the celebration is the event's, pushed once, never something this answer
 * carries: opening the screen is not what happened.
 */
export class DescribeAchievements implements UseCase<AchievementsInput, AchievementsOutput> {
  constructor(
    private readonly evaluation: AchievementsEvaluation,
    private readonly awarding: BadgeAwarding,
  ) {}

  async execute(input: AchievementsInput): Promise<Result<AchievementsOutput, AppError>> {
    const measurement = await this.evaluation.measure(input.userId);
    const collection = await this.awarding.awardDue(input.userId, measurement.attainments);

    return ok({
      syncStatus: measurement.syncStatus,
      todayKey: measurement.todayKey,
      streak: measurement.streak === null ? null : streakToDto(measurement.streak),
      badges: badgesToDto(collection, measurement.attainments),
    });
  }
}
