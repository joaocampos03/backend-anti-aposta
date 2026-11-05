import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { INBOX_CAPACITY } from '../domain/notification.js';
import { InMemoryInboxRepository } from '../infrastructure/in-memory/in-memory-inbox.repository.js';
import { InMemoryMovementReader } from '../infrastructure/in-memory/in-memory-movement-reader.js';
import { InMemoryNotificationRepository } from '../infrastructure/in-memory/in-memory-notification.repository.js';
import { InProcessNotificationStream } from '../infrastructure/in-process-notification-stream.js';
import {
  AnnounceIngestedTransactions,
  MOVEMENT_LINES_KEPT,
} from './announce-ingested-transactions.use-case.js';
import { CreateInbox } from './create-inbox.use-case.js';
import type { NotificationDto } from './dto/notification.dto.js';
import { ListNotifications } from './list-notifications.use-case.js';
import { MarkNotificationsRead } from './mark-notifications-read.use-case.js';
import { NotificationDelivery } from './notification-delivery.js';
import type { MovementLine } from './ports/movement-reader.port.js';

const ANA = '0192f3c1-7a1b-7c3e-9f20-0000000000aa';
const BRUNO = '0192f3c1-7a1b-7c3e-9f20-0000000000bb';
const FIRST_READING = '2026-10-12T15:00:00.000Z';

let clock: FixedClock;
let movements: InMemoryMovementReader;
let announce: AnnounceIngestedTransactions;
let list: ListNotifications;
let markRead: MarkNotificationsRead;

beforeEach(async () => {
  clock = new FixedClock(new Date(FIRST_READING));
  const idGenerator = new SequentialIdGenerator();
  const inboxes = new InMemoryInboxRepository();
  const notifications = new InMemoryNotificationRepository();
  movements = new InMemoryMovementReader();
  const delivery = new NotificationDelivery({
    inboxes,
    notifications,
    channel: new InProcessNotificationStream(),
    idGenerator,
    clock,
  });
  announce = new AnnounceIngestedTransactions(delivery, movements);
  list = new ListNotifications(notifications, movements);
  markRead = new MarkNotificationsRead(notifications, clock);

  const createInbox = new CreateInbox(inboxes, idGenerator, clock);
  await createInbox.execute({ userId: ANA });
  await createInbox.execute({ userId: BRUNO });
});

function transactionIdsOf(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `transaction-${index}`);
}

function aLine(transactionId: string, day: number): MovementLine {
  return {
    transactionId,
    occurredAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`,
    counterparty: 'Aposta Andorinha',
    amountInCents: -5000,
    bet: { matchedBy: 'GAMBLING_MCC', confidence: 'HIGH' },
  };
}

async function deliver(userId: string, ingestedCount: number): Promise<string> {
  const announced = await announce.execute({ userId, transactionIds: transactionIdsOf(ingestedCount) });

  if (!announced.ok || announced.value === null) throw new Error('the delivery was refused');

  return announced.value.id;
}

async function inboxOf(userId: string): Promise<readonly NotificationDto[]> {
  const listed = await list.execute({ userId });

  if (!listed.ok) throw new Error('the list was refused');

  return listed.value;
}

describe('listing an inbox', () => {
  it('answers newest first, unread, and only the caller’s', async () => {
    const older = await deliver(ANA, 1);
    const newer = await deliver(ANA, 2);
    await deliver(BRUNO, 3);

    const inbox = await inboxOf(ANA);

    expect(inbox.map((notification) => notification.id)).toEqual([newer, older]);
    expect(inbox.every((notification) => notification.readAt === null)).toBe(true);
  });

  it('keeps the newest ones and lets the oldest go', async () => {
    const oldest = await deliver(ANA, 1);

    for (let index = 0; index < INBOX_CAPACITY; index += 1) {
      await deliver(ANA, 2);
    }

    const inbox = await inboxOf(ANA);

    expect(inbox).toHaveLength(INBOX_CAPACITY);
    expect(inbox.map((notification) => notification.id)).not.toContain(oldest);
  });

  it('never drops one person’s notifications to make room for another’s', async () => {
    const bruno = await deliver(BRUNO, 1);

    for (let index = 0; index <= INBOX_CAPACITY; index += 1) {
      await deliver(ANA, 2);
    }

    expect((await inboxOf(BRUNO)).map((notification) => notification.id)).toEqual([bruno]);
  });
});

describe('quoting the movements behind an announcement', () => {
  it('lists what arrived, newest first, read from the statement', async () => {
    const older = aLine('older', 1);
    const newer = { ...aLine('newer', 2), bet: null };
    movements.lines = [older, newer].map((line) => ({ userId: ANA, line }));

    await announce.execute({ userId: ANA, transactionIds: ['older', 'newer'] });

    expect((await inboxOf(ANA))[0]?.movements).toEqual([newer, older]);
  });

  it('keeps the ids of the newest few and the count of them all', async () => {
    const ids = transactionIdsOf(MOVEMENT_LINES_KEPT + 3);
    movements.lines = ids.map((id, index) => ({ userId: ANA, line: aLine(id, index + 1) }));

    await announce.execute({ userId: ANA, transactionIds: ids });

    const [announced] = await inboxOf(ANA);

    expect(announced?.content).toMatchObject({ ingestedCount: ids.length });
    expect(announced?.movements).toHaveLength(MOVEMENT_LINES_KEPT);
    expect(announced?.movements[0]?.transactionId).toBe(ids.at(-1));
  });

  it('shows a correction at once, because nothing was copied', async () => {
    movements.lines = [{ userId: ANA, line: aLine('corrected', 1) }];
    await announce.execute({ userId: ANA, transactionIds: ['corrected'] });

    movements.lines = [{ userId: ANA, line: { ...aLine('corrected', 1), bet: null } }];

    expect((await inboxOf(ANA))[0]?.movements[0]?.bet).toBeNull();
  });

  it('keeps the count and no movement once the statement is gone', async () => {
    movements.lines = [{ userId: ANA, line: aLine('revoked', 1) }];
    await announce.execute({ userId: ANA, transactionIds: ['revoked'] });

    movements.lines = [];

    const [announced] = await inboxOf(ANA);

    expect(announced?.movements).toEqual([]);
    expect(announced?.content).toMatchObject({ ingestedCount: 1 });
  });

  it('stores ids and nothing about the movement itself', async () => {
    movements.lines = [{ userId: ANA, line: aLine('stored', 1) }];
    await announce.execute({ userId: ANA, transactionIds: ['stored'] });

    expect((await inboxOf(ANA))[0]?.content).toEqual({
      kind: 'TRANSACTIONS_INGESTED',
      ingestedCount: 1,
      transactionIds: ['stored'],
    });
  });
});

describe('marking as read', () => {
  it('stamps the named ones and leaves a later arrival unread', async () => {
    const seen = await deliver(ANA, 1);
    const later = await deliver(ANA, 2);

    await markRead.execute({ userId: ANA, notificationIds: [seen] });

    const inbox = await inboxOf(ANA);

    expect(inbox.find(({ id }) => id === seen)?.readAt).toBe(FIRST_READING);
    expect(inbox.find(({ id }) => id === later)?.readAt).toBeNull();
  });

  it('keeps the first reading when it is repeated', async () => {
    const seen = await deliver(ANA, 1);

    await markRead.execute({ userId: ANA, notificationIds: [seen] });
    clock.advanceByDays(1);
    await markRead.execute({ userId: ANA, notificationIds: [seen] });

    expect((await inboxOf(ANA))[0]?.readAt).toBe(FIRST_READING);
  });

  it('changes nothing for somebody else’s id, and says nothing about it', async () => {
    const theirs = await deliver(BRUNO, 1);

    const marked = await markRead.execute({ userId: ANA, notificationIds: [theirs] });

    expect(marked.ok).toBe(true);
    expect((await inboxOf(BRUNO))[0]?.readAt).toBeNull();
  });
});
