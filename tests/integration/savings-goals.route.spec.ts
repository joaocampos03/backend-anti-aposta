import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registerCaller } from './ledger-fixture.js';
import { createTestApp } from './test-app.js';

const GOALS_PATH = '/api/v1/savings-goals';

let token: string;

function brl(amountInCents: number): { amountInCents: number; currency: 'BRL' } {
  return { amountInCents, currency: 'BRL' };
}

function asCaller(test: request.Test, as = token): request.Test {
  return test.set('Authorization', `Bearer ${as}`);
}

async function createGoal(targetInCents = 100_000, as = token): Promise<string> {
  const response = await asCaller(
    request(createTestApp())
      .post(GOALS_PATH)
      .send({ title: 'Trocar a geladeira', purpose: 'HOME', target: brl(targetInCents) }),
    as,
  );

  expect(response.status).toBe(201);

  return String(response.body.id);
}

function recordMovement(
  goalId: string,
  body: { direction: string; amount: unknown },
  idempotencyKey?: string,
): request.Test {
  const test = asCaller(request(createTestApp()).post(`${GOALS_PATH}/${goalId}/movements`).send(body));

  return idempotencyKey === undefined ? test : test.set('Idempotency-Key', idempotencyKey);
}

beforeEach(async () => {
  token = (await registerCaller('ana@exemplo.com')).token;
});

describe('POST /api/v1/savings-goals', () => {
  it('creates an empty goal and answers it in the list shape', async () => {
    const response = await asCaller(
      request(createTestApp())
        .post(GOALS_PATH)
        .send({ title: '  Curso técnico ', purpose: 'EDUCATION', target: brl(120_000) }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: 'Curso técnico',
      purpose: 'EDUCATION',
      target: brl(120_000),
      saved: brl(0),
      remaining: brl(120_000),
      progressPercent: 0,
      isReached: false,
      reachedAt: null,
      movementCount: 0,
    });
  });

  it('refuses a short title and a zero target with a message per field', async () => {
    const response = await asCaller(
      request(createTestApp()).post(GOALS_PATH).send({ title: 'ab', purpose: 'HOME', target: brl(0) }),
    );

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(response.body.error.details)).toEqual(['title']);
  });

  it('refuses a balance the client tries to write itself', async () => {
    const response = await asCaller(
      request(createTestApp())
        .post(GOALS_PATH)
        .send({ title: 'Viagem', purpose: 'TRAVEL', target: brl(10_000), savedInCents: 10_000 }),
    );

    expect(response.status).toBe(422);
  });

  it('refuses a request with no session', async () => {
    const response = await request(createTestApp())
      .post(GOALS_PATH)
      .send({ title: 'Viagem', purpose: 'TRAVEL', target: brl(10_000) });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/savings-goals', () => {
  it('lists only the caller’s goals, newest first, with the balance summed from the movements', async () => {
    const older = await createGoal(100_000);
    const newer = await createGoal(50_000);
    await recordMovement(older, { direction: 'DEPOSIT', amount: brl(60_000) });
    await recordMovement(older, { direction: 'WITHDRAWAL', amount: brl(10_000) });
    const somebodyElse = await registerCaller('bia@exemplo.com');
    await createGoal(10_000, somebodyElse.token);

    const response = await asCaller(request(createTestApp()).get(GOALS_PATH));

    expect(response.status).toBe(200);
    expect(z.array(z.object({ id: z.string() })).parse(response.body.items).map((goal) => goal.id)).toEqual([
      newer,
      older,
    ]);
    expect(response.body.items[1]).toMatchObject({ saved: brl(50_000), movementCount: 2, progressPercent: 50 });
    expect(response.body.nextCursor).toBeNull();
  });

  it('pages with an opaque cursor', async () => {
    await createGoal();
    await createGoal();
    await createGoal();

    const first = await asCaller(request(createTestApp()).get(`${GOALS_PATH}?limit=2`));
    const second = await asCaller(
      request(createTestApp()).get(`${GOALS_PATH}?limit=2&cursor=${String(first.body.nextCursor)}`),
    );

    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('refuses a cursor it did not issue', async () => {
    const response = await asCaller(request(createTestApp()).get(`${GOALS_PATH}?cursor=bm9wZQ`));

    expect(response.status).toBe(422);
  });
});

describe('POST /api/v1/savings-goals/{goalId}/movements', () => {
  it('records a deposit and answers the goal after it', async () => {
    const goalId = await createGoal(100_000);

    const response = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(35_000) });

    expect(response.status).toBe(201);
    expect(response.body.reachedNow).toBe(false);
    expect(response.body.goal).toMatchObject({ saved: brl(35_000), remaining: brl(65_000) });
    expect(response.body.movement).toMatchObject({ direction: 'DEPOSIT', amount: brl(35_000) });
  });

  it('reports reachedNow on the deposit that crosses the target, and only on that one', async () => {
    const goalId = await createGoal(100_000);
    await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(90_000) });

    const crossing = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(10_000) });
    const after = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(5_000) });

    expect(crossing.body.reachedNow).toBe(true);
    expect(crossing.body.goal.reachedAt).not.toBeNull();
    expect(after.body.reachedNow).toBe(false);
  });

  it('refuses a withdrawal above the balance and sends the balance', async () => {
    const goalId = await createGoal(100_000);
    await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(20_000) });

    const response = await recordMovement(goalId, { direction: 'WITHDRAWAL', amount: brl(20_001) });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(response.body.error.details).toEqual({ savedInCents: 20_000 });
  });

  it('answers 404 for another person’s goal, exactly as for one that does not exist', async () => {
    const somebodyElse = await registerCaller('bia@exemplo.com');
    const theirs = await createGoal(100_000, somebodyElse.token);

    const response = await recordMovement(theirs, { direction: 'DEPOSIT', amount: brl(1_000) });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('GOAL_NOT_FOUND');
  });

  it('refuses a fraction of a cent', async () => {
    const goalId = await createGoal();

    const response = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(10.5) });

    expect(response.status).toBe(422);
  });

  describe('Idempotency-Key', () => {
    it('answers a replay with the original movement and books it once', async () => {
      const goalId = await createGoal(100_000);

      const first = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(100_000) }, 'tap-0001');
      const replay = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(100_000) }, 'tap-0001');

      expect(replay.status).toBe(201);
      expect(replay.body.movement.id).toBe(first.body.movement.id);
      expect(replay.body.reachedNow).toBe(true);
      expect(replay.body.goal.saved).toEqual(brl(100_000));
    });

    it('refuses the same key for a different movement', async () => {
      const goalId = await createGoal(100_000);
      await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(1_000) }, 'tap-0001');

      const response = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(2_000) }, 'tap-0001');

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('refuses a malformed key', async () => {
      const goalId = await createGoal();

      const response = await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(1_000) }, 'no spaces!');

      expect(response.status).toBe(422);
    });
  });

  it('lets only one of two withdrawals racing for the same balance through', async () => {
    const goalId = await createGoal(100_000);
    await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(10_000) });

    const responses = await Promise.all([
      recordMovement(goalId, { direction: 'WITHDRAWAL', amount: brl(10_000) }),
      recordMovement(goalId, { direction: 'WITHDRAWAL', amount: brl(10_000) }),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    const list = await asCaller(request(createTestApp()).get(GOALS_PATH));

    expect(statuses[0]).toBe(201);
    expect([409, 422]).toContain(statuses[1]);
    expect(list.body.items[0].saved).toEqual(brl(0));
  });
});

describe('GET /api/v1/savings-goals/{goalId}/movements', () => {
  it('lists the history newest first, flagging the movement that reached the target', async () => {
    const goalId = await createGoal(50_000);
    await recordMovement(goalId, { direction: 'DEPOSIT', amount: brl(50_000) });
    await recordMovement(goalId, { direction: 'WITHDRAWAL', amount: brl(5_000) });

    const response = await asCaller(request(createTestApp()).get(`${GOALS_PATH}/${goalId}/movements`));

    expect(response.status).toBe(200);
    const movements = z.array(z.object({ direction: z.string() })).parse(response.body.items);

    expect(movements.map((movement) => movement.direction)).toEqual([
      'WITHDRAWAL',
      'DEPOSIT',
    ]);
    expect(response.body.items[1].reachedTarget).toBe(true);
  });

  it('answers 404 for another person’s goal', async () => {
    const somebodyElse = await registerCaller('bia@exemplo.com');
    const theirs = await createGoal(100_000, somebodyElse.token);

    const response = await asCaller(request(createTestApp()).get(`${GOALS_PATH}/${theirs}/movements`));

    expect(response.status).toBe(404);
  });

  it('refuses a goal id that is not a uuid', async () => {
    const response = await asCaller(request(createTestApp()).get(`${GOALS_PATH}/not-an-id/movements`));

    expect(response.status).toBe(422);
  });
});
