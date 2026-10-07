import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Inbox } from '../domain/inbox.js';
import type { InboxRepository } from '../domain/inbox.repository.js';

export interface CreateInboxInput {
  readonly userId: string;
}

/** Reaction to `UserRegistered`. Idempotent, and pushes nothing to the stream. */
export class CreateInbox implements UseCase<CreateInboxInput, void> {
  constructor(
    private readonly inboxes: InboxRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateInboxInput): Promise<Result<void, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);
    const existing = await this.inboxes.findByUserId(userId);

    if (existing !== null) {
      return ok(undefined);
    }

    await this.inboxes.save(
      Inbox.empty({ id: this.idGenerator.generate(), userId, createdAt: this.clock.now() }),
    );

    return ok(undefined);
  }
}
