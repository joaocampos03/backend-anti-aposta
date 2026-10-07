import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { InMemoryStreakRepository } from '../infrastructure/in-memory/in-memory-streak.repository.js';
import { StartStreak } from './start-streak.use-case.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77';

let streaks: InMemoryStreakRepository;
let startStreak: StartStreak;

beforeEach(() => {
  streaks = new InMemoryStreakRepository();
  startStreak = new StartStreak(
    streaks,
    new SequentialIdGenerator(),
    new FixedClock(new Date('2026-10-03T13:04:11.182Z')),
  );
});

describe('StartStreak', () => {
  it('starts the streak at zero days, not at day one', async () => {
    await startStreak.execute({ userId: USER_ID });

    expect(streaks.streaks[0]?.currentDays).toBe(0);
    expect(streaks.streaks[0]?.longestDays).toBe(0);
  });

  it('leaves a single streak when the same event arrives twice', async () => {
    await startStreak.execute({ userId: USER_ID });
    await startStreak.execute({ userId: USER_ID });

    expect(streaks.streaks).toHaveLength(1);
  });
});
