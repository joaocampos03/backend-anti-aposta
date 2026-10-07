import { beforeEach, describe, expect, it } from 'vitest';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { FixedClock } from '@shared/testing/fixed-clock.js';
import { RecordingEventPublisher } from '@shared/testing/recording-event-publisher.js';
import { UserSignedOut } from '../domain/events/user-signed-out.js';
import { Session } from '../domain/session.js';
import { InMemorySessionRepository } from '../infrastructure/in-memory/in-memory-session.repository.js';
import { InMemorySessionTokenGenerator } from '../infrastructure/in-memory/in-memory-session-token-generator.js';
import { SignOut } from './sign-out.use-case.js';

const ISSUED_AT = new Date('2026-10-03T13:04:11.182Z');
const USER_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000001');
const OTHER_USER_SESSION_ID = UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000009');

let sessions: InMemorySessionRepository;
let sessionTokens: InMemorySessionTokenGenerator;
let events: RecordingEventPublisher;
let clock: FixedClock;
let signOut: SignOut;
let token: string;

function issueSession(id: UniqueEntityId, value: string): Session {
  return Session.issueOnSignIn({
    id,
    userId: USER_ID,
    tokenFingerprint: sessionTokens.fingerprint(value),
    issuedAt: ISSUED_AT,
    lifetimeInDays: 14,
  });
}

beforeEach(async () => {
  sessions = new InMemorySessionRepository();
  sessionTokens = new InMemorySessionTokenGenerator();
  events = new RecordingEventPublisher();
  clock = new FixedClock(ISSUED_AT);
  signOut = new SignOut(sessions, sessionTokens, clock, events);

  token = sessionTokens.generate();
  const session = issueSession(
    UniqueEntityId.restore('0192f3c1-7a1b-7c3e-9f20-000000000002'),
    token,
  );
  session.pullEvents();
  await sessions.save(session);
});

describe('SignOut', () => {
  it('revokes the caller session', async () => {
    const result = await signOut.execute({ token });

    expect(result.ok).toBe(true);
    expect(sessions.sessions[0]?.stateAt(ISSUED_AT)).toBe('REVOKED');
  });

  it('emits UserSignedOut once', async () => {
    await signOut.execute({ token });

    expect(events.published).toHaveLength(1);
    expect(events.published[0]).toBeInstanceOf(UserSignedOut);
  });

  it('succeeds the second time and emits nothing more', async () => {
    await signOut.execute({ token });
    const result = await signOut.execute({ token });

    expect(result.ok).toBe(true);
    expect(events.published).toHaveLength(1);
  });

  it('succeeds for a token that never existed, because the intent is satisfied', async () => {
    const result = await signOut.execute({ token: 'op_nunca_existiu' });

    expect(result.ok).toBe(true);
    expect(events.published).toHaveLength(0);
  });

  it('succeeds for an empty token, which is what a missing header amounts to', async () => {
    const result = await signOut.execute({ token: '' });

    expect(result.ok).toBe(true);
  });

  it('leaves the other devices signed in', async () => {
    const otherToken = sessionTokens.generate();
    const other = issueSession(OTHER_USER_SESSION_ID, otherToken);
    other.pullEvents();
    await sessions.save(other);

    await signOut.execute({ token });

    expect(other.stateAt(ISSUED_AT)).toBe('ACTIVE');
  });
});
