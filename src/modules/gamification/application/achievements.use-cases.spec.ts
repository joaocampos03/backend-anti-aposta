import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '@shared/domain/calendar.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { BadgesAwarded } from '../domain/events/badges-awarded.js';
import { InMemoryBadgeCollectionRepository } from '../infrastructure/in-memory/in-memory-badge-collection.repository.js';
import { InMemoryBetDayReader } from '../infrastructure/in-memory/in-memory-bet-day-reader.js';
import { InMemoryBettingCeilingRepository } from '../infrastructure/in-memory/in-memory-betting-ceiling.repository.js';
import { InMemoryMonthlyBetHistoryReader } from '../infrastructure/in-memory/in-memory-monthly-bet-history-reader.js';
import { InMemoryReachedGoalsReader } from '../infrastructure/in-memory/in-memory-reached-goals-reader.js';
import { anEmptyCeiling, chooseCeiling, USER_ID } from '../testing/gamification.builders.js';
import { AchievementsEvaluation } from './achievements-evaluation.js';
import { announceAwardedBadges } from './badge-announcement.js';
import { BadgeAwarding } from './badge-awarding.js';
import { DescribeAchievements } from './describe-achievements.use-case.js';
import type { AchievementsOutput, BadgeDto } from './dto/achievements.dto.js';
import { EvaluateBadges } from './evaluate-badges.use-case.js';
import { ForgetMeasuredBadges } from './forget-measured-badges.use-case.js';

/** 17 October 2026, mid-afternoon in São Paulo. The window opens on 1 November 2025. */
const NOW = new Date('2026-10-17T15:00:00.000Z');
const WINDOW_DAY_COUNT = 351;

let history: InMemoryMonthlyBetHistoryReader;
let betDays: InMemoryBetDayReader;
let reachedGoals: InMemoryReachedGoalsReader;
let ceilings: InMemoryBettingCeilingRepository;
let collections: InMemoryBadgeCollectionRepository;
let events: RecordingEventPublisher;
let describeAchievements: DescribeAchievements;
let evaluateBadges: EvaluateBadges;

beforeEach(() => {
  const clock = new FixedClock(NOW);
  history = new InMemoryMonthlyBetHistoryReader();
  betDays = new InMemoryBetDayReader();
  reachedGoals = new InMemoryReachedGoalsReader();
  ceilings = new InMemoryBettingCeilingRepository();
  collections = new InMemoryBadgeCollectionRepository();
  events = new RecordingEventPublisher();

  const evaluation = new AchievementsEvaluation({
    history,
    betDays,
    ceilings,
    reachedGoals,
    calendar: new Calendar('America/Sao_Paulo'),
    clock,
  });
  const awarding = new BadgeAwarding({ collections, idGenerator: new SequentialIdGenerator(), clock, events });
  describeAchievements = new DescribeAchievements(evaluation, awarding);
  evaluateBadges = new EvaluateBadges(evaluation, awarding);
});

async function describeForUser(): Promise<AchievementsOutput> {
  const result = await describeAchievements.execute({ userId: USER_ID });

  if (!result.ok) {
    throw new Error(result.error.code);
  }

  return result.value;
}

function badge(output: AchievementsOutput, id: string): BadgeDto | undefined {
  return output.badges.find((candidate) => candidate.id === id);
}

function awardEvents(): readonly BadgesAwarded[] {
  return events.published.filter((event) => event instanceof BadgesAwarded);
}

function readyStatement(months: readonly { monthKey: string; spentInCents: number }[] = []): void {
  history.history = { syncStatus: 'READY', months };
}

describe('DescribeAchievements', () => {
  it('measures no streak without a consent, and never reports it as zero', async () => {
    const output = await describeForUser();

    expect(output.syncStatus).toBe('NO_CONSENT');
    expect(output.streak).toBeNull();
    expect(badge(output, 'streak-7')).toMatchObject({ status: 'UNEARNED', currentValue: null, progressPercent: null });
  });

  it('still measures the savings goals the person recorded without a consent', async () => {
    reachedGoals.titles = ['Geladeira'];

    const output = await describeForUser();

    expect(badge(output, 'savings-1')).toMatchObject({ status: 'EARNED', currentValue: 1 });
  });

  it('counts a statement with no bets as a lower-bound streak over the whole window', async () => {
    readyStatement();

    const output = await describeForUser();

    expect(output.streak?.window).toEqual({ firstDayKey: '2025-11-01', dayCount: WINDOW_DAY_COUNT });
    expect(output.streak?.current).toEqual({
      days: WINDOW_DAY_COUNT - 1,
      hasBetToday: false,
      startsBeforeWindow: true,
      lastBet: null,
    });
    expect(output.streak?.recentDays[0]).toEqual({ dayKey: '2026-10-17', hasBet: false });
  });

  it('awards every streak badge the figure passed in one event, and announces one of them', async () => {
    readyStatement();

    await describeForUser();

    const [award] = awardEvents();
    expect(award?.payload.awards.map((awarded) => awarded.badgeId)).toEqual([
      'streak-7',
      'streak-15',
      'streak-30',
      'streak-90',
    ]);
    expect(award === undefined ? null : announceAwardedBadges(award.payload)).toEqual({
      userId: USER_ID,
      badgeId: 'streak-90',
      title: 'Três meses sem apostas',
      description:
        'Pelo menos 350 dias seguidos sem nenhuma aposta identificada no extrato. Outras 3 conquistas também foram registradas.',
    });
  });

  it('awards nothing twice when the screen is read again', async () => {
    readyStatement();

    await describeForUser();
    await describeForUser();

    expect(awardEvents()).toHaveLength(1);
  });

  it('keeps a badge earned after a bet ends the streak that earned it', async () => {
    readyStatement();
    await describeForUser();

    betDays.days = [{ dayKey: '2026-10-16', counterparty: 'Bet Nacional', matchedBy: 'GAMBLING_MCC' }];
    const output = await describeForUser();

    expect(badge(output, 'streak-90')).toMatchObject({ status: 'EARNED', currentValue: 349 });
    expect(output.streak?.current).toMatchObject({ days: 0, startsBeforeWindow: false });
  });

  it('measures the ceiling against closed months only', async () => {
    const ceiling = anEmptyCeiling();
    chooseCeiling(ceiling, { amountInCents: 100_000, currentMonth: '2026-08', nextMonth: '2026-09' });
    ceilings.ceilings.push(ceiling);
    readyStatement([
      { monthKey: '2026-10', spentInCents: 0 },
      { monthKey: '2026-09', spentInCents: 40_000 },
      { monthKey: '2026-08', spentInCents: 90_000 },
    ]);

    const output = await describeForUser();

    expect(badge(output, 'ceiling-1')).toMatchObject({
      status: 'EARNED',
      currentValue: 2,
      evidence: { kind: 'MONTH_RUN', months: 2, lastMonthKey: '2026-09' },
    });
    expect(badge(output, 'ceiling-3')).toMatchObject({ status: 'UNEARNED', progressPercent: 67 });
  });

  it('ignores the open month when counting a fall in spending', async () => {
    readyStatement([
      { monthKey: '2026-10', spentInCents: 0 },
      { monthKey: '2026-09', spentInCents: 80_000 },
      { monthKey: '2026-08', spentInCents: 40_000 },
    ]);

    const output = await describeForUser();

    expect(badge(output, 'reduction-1')).toMatchObject({ status: 'UNEARNED', currentValue: 0, evidence: null });
  });
});

describe('EvaluateBadges', () => {
  it('awards a savings badge when a goal is reached', async () => {
    reachedGoals.titles = ['Reserva para imprevistos'];

    await evaluateBadges.execute({ userId: USER_ID });

    expect(awardEvents()[0]?.payload.awards.map((awarded) => awarded.badgeId)).toEqual(['savings-1']);
  });
});

describe('ForgetMeasuredBadges', () => {
  it('forgets the statement badges on revocation and keeps the recorded ones', async () => {
    readyStatement();
    reachedGoals.titles = ['Reserva para imprevistos'];
    await evaluateBadges.execute({ userId: USER_ID });

    await new ForgetMeasuredBadges(collections).execute({ userId: USER_ID });

    expect(collections.collections[0]?.heldBadges.map((held) => held.kind)).toEqual(['savings-1']);
  });

  it('does nothing for a person who never had a collection', async () => {
    const result = await new ForgetMeasuredBadges(collections).execute({ userId: USER_ID });

    expect(result.ok).toBe(true);
  });
});
