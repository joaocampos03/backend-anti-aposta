import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Calendar } from '@shared/domain/calendar.js';
import { prisma } from '@shared/infrastructure/prisma.js';
import {
  aBet,
  aRefund,
  authoriseConsent,
  daysAgo,
  ingestAndClassify,
  registerBookmaker,
  registerCaller,
} from './ledger-fixture.js';
import { createTestApp } from './test-app.js';

const ACHIEVEMENTS_PATH = '/api/v1/achievements';
const calendar = new Calendar('America/Sao_Paulo');

const badgesSchema = z.array(
  z.object({ id: z.string(), status: z.string(), awardedAt: z.string().nullable(), currentValue: z.number().nullable() }),
);

let userId: string;
let token: string;

function describeAchievements(as = token): request.Test {
  return request(createTestApp()).get(ACHIEVEMENTS_PATH).set('Authorization', `Bearer ${as}`);
}

function dayKeyOf(daysBack: number): string {
  return calendar.dayKeyOf(daysAgo(daysBack));
}

async function badgeNotificationsOf(recipientId: string): Promise<number> {
  return await prisma.notification.count({ where: { recipientId, kind: 'BADGE_AWARDED' } });
}

beforeEach(async () => {
  await registerBookmaker();
  const caller = await registerCaller('ana@exemplo.com');
  userId = caller.userId;
  token = caller.token;
});

describe('GET /api/v1/achievements', () => {
  it('refuses a request without a session', async () => {
    const response = await request(createTestApp()).get(ACHIEVEMENTS_PATH);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_INVALID');
  });

  it('answers NO_CONSENT with no streak and every measured figure unknown, never zero', async () => {
    const response = await describeAchievements();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ syncStatus: 'NO_CONSENT', streak: null });

    const badges = badgesSchema.parse(response.body.badges);
    expect(badges).toHaveLength(11);
    expect(badges.find((badge) => badge.id === 'streak-7')).toMatchObject({ status: 'UNEARNED', currentValue: null });
    expect(badges.find((badge) => badge.id === 'savings-1')).toMatchObject({ currentValue: 0 });
  });

  it('counts complete bet-free days since the last bet, naming the bet and how it was caught', async () => {
    const { checkingId } = await authoriseConsent(userId);
    await ingestAndClassify(userId, [aBet(checkingId, -5_000, daysAgo(5))]);

    const response = await describeAchievements();

    expect(response.status).toBe(200);
    expect(response.body.streak.current).toEqual({
      days: 4,
      hasBetToday: false,
      startsBeforeWindow: false,
      lastBet: { dayKey: dayKeyOf(5), counterparty: 'Aposta Andorinha', matchedBy: 'GAMBLING_MCC' },
    });
    expect(response.body.streak.recentDays[0]).toEqual({ dayKey: calendar.dayKeyOf(new Date()), hasBet: false });
  });

  it('puts a bet at 23:30 in São Paulo on the day it was placed', async () => {
    const { checkingId } = await authoriseConsent(userId);
    await ingestAndClassify(userId, [aBet(checkingId, -5_000, daysAgo(3, 23, 30))]);

    const response = await describeAchievements();

    expect(response.body.streak.current.lastBet.dayKey).toBe(dayKeyOf(3));
  });

  it('does not count a bookmaker refund as a bet day', async () => {
    const { checkingId } = await authoriseConsent(userId);
    await ingestAndClassify(userId, [aBet(checkingId, -5_000, daysAgo(10)), aRefund(checkingId, 5_000, daysAgo(2))]);

    const response = await describeAchievements();

    expect(response.body.streak.current.lastBet.dayKey).toBe(dayKeyOf(10));
    expect(response.body.streak.betDayCount).toBe(1);
  });

  it('awards the badges the figures reached on read, and announces them once', async () => {
    const { checkingId } = await authoriseConsent(userId);
    await ingestAndClassify(userId, [aBet(checkingId, -5_000, daysAgo(20))]);

    const first = badgesSchema.parse((await describeAchievements()).body.badges);
    const second = badgesSchema.parse((await describeAchievements()).body.badges);

    expect(first.filter((badge) => badge.status === 'EARNED').map((badge) => badge.id)).toEqual([
      'streak-7',
      'streak-15',
      'streak-30',
      'streak-90',
    ]);
    expect(second.find((badge) => badge.id === 'streak-7')?.awardedAt).toBe(
      first.find((badge) => badge.id === 'streak-7')?.awardedAt,
    );
    expect(await badgeNotificationsOf(userId)).toBe(1);
  });

  it("never shows one person's streak or badges to another", async () => {
    const { checkingId } = await authoriseConsent(userId);
    await ingestAndClassify(userId, [aBet(checkingId, -5_000, daysAgo(20))]);
    await describeAchievements();
    const bruno = await registerCaller('bruno@exemplo.com');

    const response = await describeAchievements(bruno.token);

    expect(response.body).toMatchObject({ syncStatus: 'NO_CONSENT', streak: null });
    expect(badgesSchema.parse(response.body.badges).every((badge) => badge.status === 'UNEARNED')).toBe(true);
    expect(await badgeNotificationsOf(bruno.userId)).toBe(0);
  });
});
