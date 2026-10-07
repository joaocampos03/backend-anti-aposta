import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { SignOutInput } from './dto/sign-out.dto.js';
import type { SessionTokenGenerator } from './ports/session-token-generator.port.js';

/**
 * Revokes the caller's session, and only theirs: other devices stay signed in,
 * and only a password reset ends every session at once.
 *
 * It cannot fail. An unknown, already-revoked or expired token is still a
 * satisfied intent — "end this session" — and reporting a failure would leave
 * somebody believing they are still signed in on a device they are handing back.
 *
 * @see docs/features/login.md
 */
export class SignOut implements UseCase<SignOutInput, void> {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly sessionTokens: SessionTokenGenerator,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
  ) {}

  async execute(input: SignOutInput): Promise<Result<void, AppError>> {
    const session = await this.sessions.findByTokenFingerprint(
      this.sessionTokens.fingerprint(input.token),
    );

    if (session === null) {
      return ok(undefined);
    }

    session.signOut(this.clock.now());

    const recorded = session.pullEvents();

    if (recorded.length === 0) {
      return ok(undefined);
    }

    await this.sessions.save(session);
    await this.events.publish(recorded);

    return ok(undefined);
  }
}
