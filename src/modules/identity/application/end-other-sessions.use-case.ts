import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { EndOtherSessionsInput } from './dto/account.dto.js';
import type { SessionTokenGenerator } from './ports/session-token-generator.port.js';

/**
 * "Sair dos outros aparelhos": for a phone left behind or a shared computer. Each
 * ended session records its own sign-out, because here the person did ask for it.
 */
export class EndOtherSessions implements UseCase<EndOtherSessionsInput, void> {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly sessionTokens: SessionTokenGenerator,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
  ) {}

  async execute(input: EndOtherSessionsInput): Promise<Result<void, AppError>> {
    const keptFingerprint = this.sessionTokens.fingerprint(input.token);
    const now = this.clock.now();
    const sessions = await this.sessions.findActiveByUserId(UniqueEntityId.restore(input.userId));

    for (const session of sessions) {
      if (session.tokenFingerprint !== keptFingerprint) {
        session.signOut(now);
        await this.sessions.save(session);
        await this.events.publish(session.pullEvents());
      }
    }

    return ok(undefined);
  }
}
