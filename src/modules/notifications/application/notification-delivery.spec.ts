import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { InMemoryInboxRepository } from '../infrastructure/in-memory/in-memory-inbox.repository.js';
import { InMemoryNotificationRepository } from '../infrastructure/in-memory/in-memory-notification.repository.js';
import { InProcessNotificationStream } from '../infrastructure/in-process-notification-stream.js';
import { AnnounceIngestedTransactions } from './announce-ingested-transactions.use-case.js';
import { CreateInbox } from './create-inbox.use-case.js';
import type { NotificationDto } from './dto/notification.dto.js';
import { NotificationDelivery } from './notification-delivery.js';
import type { YieldCalculator } from './ports/yield-calculator.port.js';
import { REPLAY_LIMIT, ReplayNotifications } from './replay-notifications.use-case.js';
import { SendDemoNotification } from './send-demo-notification.use-case.js';

const ANA = '0192f3c1-7a1b-7c3e-9f20-0000000000aa';
const BRUNO = '0192f3c1-7a1b-7c3e-9f20-0000000000bb';
const NOBODY = '0192f3c1-7a1b-7c3e-9f20-0000000000cc';

/** Doubles the amount, so a test can tell the figure came from here. */
const DOUBLING_YIELDS: YieldCalculator = {
  reframe: (amountInCents) => ({
    futureValueInCents: Math.abs(amountInCents) * 2,
    annualRatePercent: 11.4,
  }),
};

let notifications: InMemoryNotificationRepository;
let stream: InProcessNotificationStream;
let delivery: NotificationDelivery;
let sendDemo: SendDemoNotification;
let announce: AnnounceIngestedTransactions;
let replay: ReplayNotifications;

beforeEach(async () => {
  const clock = new FixedClock(new Date('2026-10-12T15:00:00.000Z'));
  const idGenerator = new SequentialIdGenerator();
  const inboxes = new InMemoryInboxRepository();
  notifications = new InMemoryNotificationRepository();
  stream = new InProcessNotificationStream();
  delivery = new NotificationDelivery({
    inboxes,
    notifications,
    channel: stream,
    idGenerator,
    clock,
  });
  sendDemo = new SendDemoNotification(delivery, DOUBLING_YIELDS);
  announce = new AnnounceIngestedTransactions(delivery);
  replay = new ReplayNotifications(notifications);

  const createInbox = new CreateInbox(inboxes, idGenerator, clock);
  await createInbox.execute({ userId: ANA });
  await createInbox.execute({ userId: BRUNO });
});

function listen(userId: string): NotificationDto[] {
  const received: NotificationDto[] = [];
  stream.subscribe(userId, (notification) => received.push(notification));

  return received;
}

describe('delivering to one person', () => {
  it('pushes to the recipient and to nobody else', async () => {
    const ana = listen(ANA);
    const bruno = listen(BRUNO);

    await sendDemo.execute({ recipientId: ANA, draft: { kind: 'STREAK_BROKEN', previousDays: 11 } });

    expect(ana.map((notification) => notification.content.kind)).toEqual(['STREAK_BROKEN']);
    expect(bruno).toHaveLength(0);
  });

  it('keeps it in the inbox when no stream is open', async () => {
    const sent = await sendDemo.execute({
      recipientId: ANA,
      draft: { kind: 'GOAL_REACHED', label: 'Curso técnico', amountInCents: 50_000 },
    });

    expect(sent.ok).toBe(true);
    expect(notifications.notifications).toHaveLength(1);
  });

  it('answers 404 for an id nobody registered, and stores nothing', async () => {
    const sent = await sendDemo.execute({
      recipientId: NOBODY,
      draft: { kind: 'STREAK_BROKEN', previousDays: 3 },
    });

    expect(!sent.ok && sent.error.code).toBe('RECIPIENT_NOT_FOUND');
    expect(!sent.ok && sent.error.status).toBe(404);
    expect(notifications.notifications).toHaveLength(0);
  });

  it('takes a nudge’s yield from awareness, never from the console', async () => {
    const sent = await sendDemo.execute({
      recipientId: ANA,
      draft: {
        kind: 'AWARENESS_NUDGE',
        merchant: 'Aposta Andorinha',
        amountInCents: -5000,
        monthlyTotalInCents: 18_400,
        matchedBy: 'MCC 7995',
      },
    });

    expect(sent.ok && sent.value.content).toMatchObject({
      yieldInCents: 10_000,
      annualRatePercent: 11.4,
    });
  });

  it('stops pushing to a stream once it unsubscribes', async () => {
    const received: NotificationDto[] = [];
    const unsubscribe = stream.subscribe(ANA, (notification) => received.push(notification));
    unsubscribe();

    await sendDemo.execute({ recipientId: ANA, draft: { kind: 'STREAK_BROKEN', previousDays: 2 } });

    expect(received).toHaveLength(0);
  });
});

describe('announcing ingested transactions', () => {
  it('tells the person how many arrived', async () => {
    const ana = listen(ANA);

    await announce.execute({ userId: ANA, ingestedCount: 3 });

    expect(ana[0]?.content).toEqual({ kind: 'TRANSACTIONS_INGESTED', ingestedCount: 3 });
  });

  it('announces nothing when nothing arrived', async () => {
    const announced = await announce.execute({ userId: ANA, ingestedCount: 0 });

    expect(announced.ok && announced.value).toBeNull();
    expect(notifications.notifications).toHaveLength(0);
  });
});

describe('replaying after a reconnection', () => {
  it('hands back only what came after the last id the browser saw, oldest first', async () => {
    const first = await announce.execute({ userId: ANA, ingestedCount: 1 });
    await announce.execute({ userId: ANA, ingestedCount: 2 });
    await announce.execute({ userId: ANA, ingestedCount: 3 });
    const lastSeenId = first.ok ? (first.value?.id ?? null) : null;

    const replayed = await replay.execute({ userId: ANA, lastSeenId });

    expect(replayed.ok && replayed.value.map((notification) => notification.content)).toEqual([
      { kind: 'TRANSACTIONS_INGESTED', ingestedCount: 2 },
      { kind: 'TRANSACTIONS_INGESTED', ingestedCount: 3 },
    ]);
  });

  it('replays nothing on a fresh connection, so dismissed nudges stay dismissed', async () => {
    await announce.execute({ userId: ANA, ingestedCount: 1 });

    const replayed = await replay.execute({ userId: ANA, lastSeenId: null });

    expect(replayed.ok && replayed.value).toEqual([]);
  });

  it('never replays somebody else’s notifications', async () => {
    const own = await announce.execute({ userId: ANA, ingestedCount: 1 });
    await announce.execute({ userId: BRUNO, ingestedCount: 5 });
    const lastSeenId = own.ok ? (own.value?.id ?? null) : null;

    const replayed = await replay.execute({ userId: ANA, lastSeenId });

    expect(replayed.ok && replayed.value).toEqual([]);
  });

  it('replays nothing for an id that is not one of ours, rather than failing', async () => {
    const replayed = await replay.execute({ userId: ANA, lastSeenId: 'not-an-id' });

    expect(replayed.ok && replayed.value).toEqual([]);
  });

  it('caps a backlog, which is an inbox to read rather than modals to open', async () => {
    const first = await announce.execute({ userId: ANA, ingestedCount: 1 });

    for (let index = 0; index < REPLAY_LIMIT + 5; index += 1) {
      await announce.execute({ userId: ANA, ingestedCount: 1 });
    }

    const replayed = await replay.execute({
      userId: ANA,
      lastSeenId: first.ok ? (first.value?.id ?? null) : null,
    });

    expect(replayed.ok && replayed.value).toHaveLength(REPLAY_LIMIT);
  });
});
