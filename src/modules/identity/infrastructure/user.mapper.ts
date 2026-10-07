import type { User as UserRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { DisplayName } from '../domain/display-name.js';
import { Email } from '../domain/email.js';
import { PasswordHash } from '../domain/password-hash.js';
import { RegistrationConsent } from '../domain/registration-consent.js';
import { User } from '../domain/user.js';

/** Prisma row to domain and back. A Prisma type never crosses the repository. */
export class UserMapper {
  static toDomain(row: UserRow): User {
    const displayName = DisplayName.create(row.displayName);
    const email = Email.create(row.email);

    if (!displayName.ok || !email.ok) {
      throw new Error(`Corrupted identity_users row: ${row.id}`);
    }

    return User.restore(UniqueEntityId.restore(row.id), {
      displayName: displayName.value,
      email: email.value,
      passwordHash: PasswordHash.restore(row.passwordHash),
      registrationConsent: RegistrationConsent.accept({
        acceptedAt: row.consentAcceptedAt,
        policyVersion: row.consentPolicyVersion,
      }),
      registeredAt: row.registeredAt,
    });
  }

  static toRow(user: User): UserRow {
    return {
      id: user.id.value,
      displayName: user.displayName.value,
      email: user.email.value,
      passwordHash: user.passwordHash.value,
      registeredAt: user.registeredAt,
      consentAcceptedAt: user.registrationConsent.acceptedAt,
      consentPolicyVersion: user.registrationConsent.policyVersion,
      consentScope: user.registrationConsent.scope,
    };
  }
}
