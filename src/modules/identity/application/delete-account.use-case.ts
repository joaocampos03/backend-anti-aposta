import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { CurrentPasswordCheck } from './current-password-check.js';
import type { DeleteAccountInput } from './dto/account.dto.js';
import { identityFailures } from './identity.failures.js';
import type { AccountErasure } from './ports/account-erasure.port.js';

/**
 * Deletes the account at once and for good: every context first, then the user
 * row, which takes the sessions with it and frees the address for a new account.
 *
 * The row goes **last** because it is what lets the person try again: if a
 * context could not finish, the account still exists, the session still works,
 * and asking again picks up where this stopped.
 */
export class DeleteAccount implements UseCase<DeleteAccountInput, void> {
  constructor(
    private readonly users: UserRepository,
    private readonly currentPassword: CurrentPasswordCheck,
    private readonly erasure: AccountErasure,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
  ) {}

  async execute(input: DeleteAccountInput): Promise<Result<void, AppError>> {
    const user = await this.users.findById(UniqueEntityId.restore(input.userId));

    if (user === null) {
      return fail(identityFailures.sessionInvalid());
    }

    const confirmed = await this.currentPassword.confirm(user, input.currentPassword);

    if (!confirmed.ok) {
      return confirmed;
    }

    if (!(await this.erasure.eraseEverythingOf(user.id.value))) {
      return fail(identityFailures.accountDeletionIncomplete());
    }

    user.recordDeletion(this.clock.now());
    await this.users.delete(user.id);
    await this.events.publish(user.pullEvents());

    return ok(undefined);
  }
}
