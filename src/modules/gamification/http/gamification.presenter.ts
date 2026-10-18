import { assertNever } from '@shared/domain/assert-never.js';
import type {
  AchievementsOutput,
  AttainmentEvidenceDto,
  BadgeDto,
  BetDayDto,
  BetFreeStreakDto,
  StreakRecordDto,
} from '../application/dto/achievements.dto.js';
import type {
  BettingCeilingOverviewOutput,
  CeilingCycleDto,
  CeilingTermDto,
  SetBettingCeilingOutput,
} from '../application/dto/betting-ceiling.dto.js';
import type {
  GoalMovementDto,
  PageDto,
  RecordedMovementOutput,
  SavingsGoalDto,
} from '../application/dto/savings-goal.dto.js';
import { encodeCursor } from './gamification.schemas.js';

function money(amountInCents: number): { amountInCents: number; currency: 'BRL' } {
  return { amountInCents, currency: 'BRL' };
}

/**
 * Domain-free, and deliberately explicit: every field is spelled out, because
 * the screen is written against this shape and a spread from a DTO that grows
 * would ship a field nobody decided to send.
 */
export class GamificationPresenter {
  static savingsGoal(goal: SavingsGoalDto): unknown {
    return {
      id: goal.id,
      title: goal.title,
      purpose: goal.purpose,
      target: money(goal.targetInCents),
      saved: money(goal.savedInCents),
      remaining: money(goal.remainingInCents),
      progressPercent: goal.progressPercent,
      isReached: goal.isReached,
      reachedAt: goal.reachedAt,
      movementCount: goal.movementCount,
      createdAt: goal.createdAt,
    };
  }

  static movement(movement: GoalMovementDto): unknown {
    return {
      id: movement.id,
      direction: movement.direction,
      amount: money(movement.amountInCents),
      occurredAt: movement.occurredAt,
      reachedTarget: movement.reachedTarget,
    };
  }

  static savingsGoals(page: PageDto<SavingsGoalDto>): unknown {
    return {
      items: page.items.map((goal) => GamificationPresenter.savingsGoal(goal)),
      nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
    };
  }

  static movements(page: PageDto<GoalMovementDto>): unknown {
    return {
      items: page.items.map((movement) => GamificationPresenter.movement(movement)),
      nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
    };
  }

  static recordedMovement(output: RecordedMovementOutput): unknown {
    return {
      goal: GamificationPresenter.savingsGoal(output.goal),
      movement: GamificationPresenter.movement(output.movement),
      reachedNow: output.reachedNow,
    };
  }

  static ceilingChoice(output: SetBettingCeilingOutput): unknown {
    return {
      ceiling: GamificationPresenter.term(output.ceiling),
      scheduled: GamificationPresenter.term(output.scheduled),
      effectiveFromMonthKey: output.effectiveFromMonthKey,
    };
  }

  static ceilingOverview(output: BettingCeilingOverviewOutput): unknown {
    return {
      syncStatus: output.syncStatus,
      month: {
        monthKey: output.month.monthKey,
        nextMonthKey: output.month.nextMonthKey,
        daysRemaining: output.month.daysRemaining,
      },
      ceiling: GamificationPresenter.term(output.ceiling),
      scheduled: GamificationPresenter.term(output.scheduled),
      current:
        output.current === null
          ? null
          : {
              ...GamificationPresenter.cycle(output.current),
              marginYieldEquivalent: money(output.current.marginYieldEquivalentInCents),
            },
      cycles: output.cycles.map((cycle) => GamificationPresenter.cycle(cycle)),
      simulation: {
        monthsCounted: output.simulation.monthsCounted,
        stepInCents: output.simulation.stepInCents,
        cap: money(output.simulation.capInCents),
        steps: output.simulation.steps.map((step) => ({
          ceiling: money(step.ceilingInCents),
          monthsWithin: step.monthsWithin,
          averageExcess: money(step.averageExcessInCents),
          totalExcess: money(step.totalExcessInCents),
          averageExcessYieldEquivalent: money(step.averageExcessYieldEquivalentInCents),
        })),
      },
      annualRatePercent: output.annualRatePercent,
    };
  }

  static achievements(output: AchievementsOutput): unknown {
    return {
      syncStatus: output.syncStatus,
      todayKey: output.todayKey,
      streak: output.streak === null ? null : GamificationPresenter.streak(output.streak),
      badges: output.badges.map((badge) => GamificationPresenter.badge(badge)),
    };
  }

  private static streak(streak: StreakRecordDto): unknown {
    return {
      window: { firstDayKey: streak.window.firstDayKey, dayCount: streak.window.dayCount },
      current: {
        days: streak.current.days,
        hasBetToday: streak.current.hasBetToday,
        startsBeforeWindow: streak.current.startsBeforeWindow,
        lastBet: streak.current.lastBet === null ? null : GamificationPresenter.betDay(streak.current.lastBet),
      },
      longest: streak.longest === null ? null : GamificationPresenter.betFreeStreak(streak.longest),
      closedStreaks: streak.closedStreaks.map((closed) => GamificationPresenter.betFreeStreak(closed)),
      closedStreakCount: streak.closedStreakCount,
      betDayCount: streak.betDayCount,
      betFreeDayCount: streak.betFreeDayCount,
      recentDays: streak.recentDays.map((day) => ({ dayKey: day.dayKey, hasBet: day.hasBet })),
    };
  }

  private static betFreeStreak(streak: BetFreeStreakDto): unknown {
    return {
      lengthInDays: streak.lengthInDays,
      firstDayKey: streak.firstDayKey,
      lastDayKey: streak.lastDayKey,
      startsBeforeWindow: streak.startsBeforeWindow,
      endedBy: GamificationPresenter.betDay(streak.endedBy),
    };
  }

  private static betDay(day: BetDayDto): unknown {
    return { dayKey: day.dayKey, counterparty: day.counterparty, matchedBy: day.matchedBy };
  }

  private static badge(badge: BadgeDto): unknown {
    return {
      id: badge.id,
      family: badge.family,
      title: badge.title,
      criterion: badge.criterion,
      threshold: badge.threshold,
      status: badge.status,
      awardedAt: badge.awardedAt,
      currentValue: badge.currentValue,
      progressPercent: badge.progressPercent,
      evidence: badge.evidence === null ? null : GamificationPresenter.evidence(badge.evidence),
    };
  }

  private static evidence(evidence: AttainmentEvidenceDto): unknown {
    switch (evidence.kind) {
      case 'CURRENT_STREAK':
        return { kind: evidence.kind, days: evidence.days, startsBeforeWindow: evidence.startsBeforeWindow };
      case 'CLOSED_STREAK':
        return {
          kind: evidence.kind,
          days: evidence.days,
          firstDayKey: evidence.firstDayKey,
          lastDayKey: evidence.lastDayKey,
          startsBeforeWindow: evidence.startsBeforeWindow,
        };
      case 'MONTH_RUN':
        return { kind: evidence.kind, months: evidence.months, lastMonthKey: evidence.lastMonthKey };
      case 'REACHED_GOALS':
        return { kind: evidence.kind, count: evidence.count, titles: [...evidence.titles] };
      default:
        return assertNever(evidence);
    }
  }

  private static term(term: CeilingTermDto | null): unknown {
    if (term === null) {
      return null;
    }

    return {
      amount: money(term.amountInCents),
      destination: term.destination,
      effectiveFromMonthKey: term.effectiveFromMonthKey,
      setAt: term.setAt,
    };
  }

  private static cycle(cycle: CeilingCycleDto): Record<string, unknown> {
    return {
      monthKey: cycle.monthKey,
      ceiling: money(cycle.ceilingInCents),
      destination: cycle.destination,
      spent: money(cycle.spentInCents),
      status: cycle.status,
      margin: money(cycle.marginInCents),
      usedPercent: cycle.usedPercent,
    };
  }
}
