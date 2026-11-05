import type { AppError } from '@shared/application/app-error.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Email } from '../domain/email.js';
import { EmailCollisionError } from '../domain/identity.errors.js';
import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { CurrentPasswordCheck } from './current-password-check.js';
import type { ChangeEmailInput } from './dto/account.dto.js';
import { identityFailures } from './identity.failures.js';
import { IDENTITY_FIELD_MESSAGES } from './identity.messages.js';

/**
 * Changes the address the person signs in with. The password comes first, so an
 * address already in use is only ever disclosed to whoever holds the credential,
 * and a stolen session cannot move the account somewhere else.
 *
 * The new address is **not verified**: no mail provider exists in either
 * repository, so nothing can be sent to it. A typo leaves the person signing in
 * with the typo, which the screen warns about. Password recovery is the use case
 * that will need that verification once a mailer lands.
 */
export class ChangeEmail implements UseCase<ChangeEmailInput, void> {
  constructor(
    private readonly users: UserRepository,
    private readonly currentPassword: CurrentPasswordCheck,
  ) {}

  async execute(input: ChangeEmailInput): Promise<Result<void, AppError>> {
    const email = Email.create(input.email);

    if (!email.ok) {
      return fail(identityFailures.validationFailed({ email: IDENTITY_FIELD_MESSAGES.email }));
    }

    const user = await this.users.findById(UniqueEntityId.restore(input.userId));

    if (user === null) {
      return fail(identityFailures.sessionInvalid());
    }

    const confirmed = await this.currentPassword.confirm(user, input.currentPassword);

    if (!confirmed.ok) {
      return confirmed;
    }

    if (user.email.equals(email.value)) {
      return ok(undefined);
    }

    if (await this.users.existsWithEmail(email.value)) {
      return fail(identityFailures.emailAlreadyRegistered());
    }

    user.changeEmail(email.value);

    return await this.save(user);
  }

  /** The unique index is the backstop for two people claiming the address at once. */
  private async save(user: User): Promise<Result<void, AppError>> {
    try {
      await this.users.save(user);

      return ok(undefined);
    } catch (cause) {
      if (cause instanceof EmailCollisionError) {
        return fail(identityFailures.emailAlreadyRegistered());
      }

      throw cause;
    }
  }
}
