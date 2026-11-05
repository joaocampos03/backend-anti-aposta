import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { AccountOutput, DescribeAccountInput } from './dto/account.dto.js';
import { identityFailures } from './identity.failures.js';

/** What the settings screen shows: the account, the consent behind it and its open sessions. */
export class DescribeAccount implements UseCase<DescribeAccountInput, AccountOutput> {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: DescribeAccountInput): Promise<Result<AccountOutput, AppError>> {
    const userId = UniqueEntityId.restore(input.userId);
    const user = await this.users.findById(userId);

    if (user === null) {
      return fail(identityFailures.sessionInvalid());
    }

    const now = this.clock.now();
    const sessions = await this.sessions.findActiveByUserId(userId);

    return ok({
      user: {
        id: user.id.value,
        name: user.displayName.value,
        email: user.email.value,
        registeredAt: user.registeredAt.toISOString(),
      },
      registrationConsent: {
        acceptedAt: user.registrationConsent.acceptedAt.toISOString(),
        policyVersion: user.registrationConsent.policyVersion,
        scope: user.registrationConsent.scope,
      },
      // The repository leaves out revoked ones; a lapsed one is still a row.
      activeSessionCount: sessions.filter((session) => session.stateAt(now) === 'ACTIVE').length,
    });
  }
}
