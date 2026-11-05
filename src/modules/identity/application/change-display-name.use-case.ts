import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { DisplayName } from '../domain/display-name.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { ChangeDisplayNameInput } from './dto/account.dto.js';
import { identityFailures } from './identity.failures.js';
import { IDENTITY_FIELD_MESSAGES } from './identity.messages.js';

/** How the person wants to be called. No password: it opens nothing and locks nobody out. */
export class ChangeDisplayName implements UseCase<ChangeDisplayNameInput, void> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: ChangeDisplayNameInput): Promise<Result<void, AppError>> {
    const displayName = DisplayName.create(input.name);

    if (!displayName.ok) {
      return fail(identityFailures.validationFailed({ name: IDENTITY_FIELD_MESSAGES.name }));
    }

    const user = await this.users.findById(UniqueEntityId.restore(input.userId));

    if (user === null) {
      return fail(identityFailures.sessionInvalid());
    }

    user.rename(displayName.value);
    await this.users.save(user);

    return ok(undefined);
  }
}
