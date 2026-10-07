import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { SequentialIdGenerator } from '@shared/testing/sequential-id-generator.js';
import { InMemoryInboxRepository } from '../infrastructure/in-memory/in-memory-inbox.repository.js';
import { CreateInbox } from './create-inbox.use-case.js';

const USER_ID = '0192f3c1-7a1b-7c3e-9f20-6b1e4a9d5c77';

let inboxes: InMemoryInboxRepository;
let createInbox: CreateInbox;

beforeEach(() => {
  inboxes = new InMemoryInboxRepository();
  createInbox = new CreateInbox(
    inboxes,
    new SequentialIdGenerator(),
    new FixedClock(new Date('2026-10-03T13:04:11.182Z')),
  );
});

describe('CreateInbox', () => {
  it('creates the inbox so the first real nudge has somewhere to land', async () => {
    await createInbox.execute({ userId: USER_ID });

    expect(inboxes.inboxes).toHaveLength(1);
  });

  it('leaves a single inbox when the same event arrives twice', async () => {
    await createInbox.execute({ userId: USER_ID });
    await createInbox.execute({ userId: USER_ID });

    expect(inboxes.inboxes).toHaveLength(1);
  });
});
