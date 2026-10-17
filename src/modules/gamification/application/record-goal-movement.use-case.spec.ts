import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { SavingsGoalReached } from '../domain/events/savings-goal-reached.js';
import { InMemorySavingsGoalRepository } from '../infrastructure/in-memory/in-memory-savings-goal.repository.js';
import { aSavingsGoal, USER_ID } from '../testing/gamification.builders.js';
import { CreateSavingsGoal } from './create-savings-goal.use-case.js';
import type { RecordGoalMovementInput } from './dto/savings-goal.dto.js';
import { RecordGoalMovement } from './record-goal-movement.use-case.js';

const SOMEBODY_ELSE = '0192f3c1-7a1b-7c3e-9f20-aaaaaaaaaaaa';

let goals: InMemorySavingsGoalRepository;
let events: RecordingEventPublisher;
let recordGoalMovement: RecordGoalMovement;
let goalId: string;

function movement(overrides: Partial<RecordGoalMovementInput> = {}): RecordGoalMovementInput {
  return {
    userId: USER_ID,
    goalId,
    direction: 'DEPOSIT',
    amountInCents: 10_000,
    idempotencyKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  goals = new InMemorySavingsGoalRepository();
  events = new RecordingEventPublisher();
  recordGoalMovement = new RecordGoalMovement({
    goals,
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(new Date('2026-10-17T15:00:00.000Z')),
    events,
  });

  const goal = aSavingsGoal(100_000).withMovement('DEPOSIT', 80_000).build();
  goals.goals.push(goal);
  goalId = goal.id.value;
});

describe('RecordGoalMovement', () => {
  it('answers 404 for a goal that belongs to somebody else', async () => {
    const result = await recordGoalMovement.execute(movement({ userId: SOMEBODY_ELSE }));

    expect(result.ok ? null : result.error.code).toBe('GOAL_NOT_FOUND');
  });

  it('refuses a withdrawal above the balance and says what the balance is', async () => {
    const result = await recordGoalMovement.execute(
      movement({ direction: 'WITHDRAWAL', amountInCents: 80_001 }),
    );

    expect(result.ok ? null : result.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(result.ok ? null : result.error.details).toEqual({ savedInCents: 80_000 });
  });

  it('refuses an amount of zero as a field error', async () => {
    const result = await recordGoalMovement.execute(movement({ amountInCents: 0 }));

    expect(result.ok ? null : result.error.status).toBe(422);
    expect(result.ok ? null : Object.keys(result.error.details)).toEqual(['amount.amountInCents']);
  });

  it('answers 409 when another request changed the goal first', async () => {
    goals.conflictOnNextSave = true;

    const result = await recordGoalMovement.execute(movement());

    expect(result.ok ? null : result.error.code).toBe('GOAL_MODIFIED_CONCURRENTLY');
    expect(events.published).toEqual([]);
  });

  it('records a deposit that stops short without celebrating it', async () => {
    const result = await recordGoalMovement.execute(movement({ amountInCents: 10_000 }));

    expect(result.ok && result.value.reachedNow).toBe(false);
    expect(result.ok && result.value.goal.savedInCents).toBe(90_000);
    expect(events.published).toEqual([]);
  });

  it('reports reachedNow on the deposit that crosses the target and publishes the event', async () => {
    const result = await recordGoalMovement.execute(movement({ amountInCents: 20_000 }));

    expect(result.ok && result.value.reachedNow).toBe(true);
    expect(result.ok && result.value.goal.isReached).toBe(true);
    expect(events.published.map((event) => event.name)).toEqual([SavingsGoalReached.NAME]);
  });

  describe('idempotency', () => {
    it('answers a replay with the movement it already recorded, booking nothing twice', async () => {
      const first = await recordGoalMovement.execute(movement({ idempotencyKey: 'tap-1', amountInCents: 20_000 }));
      const replay = await recordGoalMovement.execute(movement({ idempotencyKey: 'tap-1', amountInCents: 20_000 }));

      expect(replay).toEqual(first);
      expect(replay.ok && replay.value.goal.movementCount).toBe(2);
    });

    it('refuses a key reused for a different movement', async () => {
      await recordGoalMovement.execute(movement({ idempotencyKey: 'tap-1', amountInCents: 20_000 }));

      const reused = await recordGoalMovement.execute(movement({ idempotencyKey: 'tap-1', amountInCents: 5_000 }));

      expect(reused.ok ? null : reused.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });
});

describe('CreateSavingsGoal', () => {
  it('refuses a title that is blank once trimmed, as a field error', async () => {
    const createSavingsGoal = new CreateSavingsGoal(
      new InMemorySavingsGoalRepository(),
      new SequentialIdGenerator(),
      new FixedClock(new Date('2026-10-17T15:00:00.000Z')),
    );

    const result = await createSavingsGoal.execute({
      userId: USER_ID,
      title: '   ',
      purpose: 'HOME',
      targetInCents: 100_000,
    });

    expect(result.ok ? null : result.error.details).toEqual({
      title: 'Dê um nome com pelo menos 3 letras.',
    });
  });

  it('starts a goal empty, unreached, with its full target remaining', async () => {
    const createSavingsGoal = new CreateSavingsGoal(
      new InMemorySavingsGoalRepository(),
      new SequentialIdGenerator(),
      new FixedClock(new Date('2026-10-17T15:00:00.000Z')),
    );

    const result = await createSavingsGoal.execute({
      userId: USER_ID,
      title: 'Trocar a geladeira',
      purpose: 'HOME',
      targetInCents: 220_000,
    });

    expect(result.ok && result.value).toMatchObject({
      savedInCents: 0,
      remainingInCents: 220_000,
      progressPercent: 0,
      isReached: false,
      reachedAt: null,
      movementCount: 0,
    });
  });
});
