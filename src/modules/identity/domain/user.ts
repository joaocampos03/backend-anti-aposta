import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Credential } from './credential.js';
import type { DisplayName } from './display-name.js';
import type { Email } from './email.js';
import { PasswordChanged } from './events/password-changed.js';
import { UserRegistered } from './events/user-registered.js';
import type { PasswordHash } from './password-hash.js';
import type { RegistrationConsent } from './registration-consent.js';

interface UserProperties {
  readonly displayName: DisplayName;
  readonly email: Email;
  readonly passwordHash: PasswordHash;
  readonly registrationConsent: RegistrationConsent;
  readonly registeredAt: Date;
}

/**
 * The account. Registration grants it no financial-data scope: reading a
 * statement needs a second, separate Open Finance consent that this aggregate
 * knows nothing about.
 */
export class User extends AggregateRoot {
  private properties: UserProperties;

  private constructor(id: UniqueEntityId, properties: UserProperties) {
    super(id);
    this.properties = properties;
  }

  /** The only way to bring a `User` into existence, consent included. */
  static register(input: { readonly id: UniqueEntityId } & UserProperties): User {
    const { id, ...properties } = input;
    const user = new User(id, properties);

    user.addEvent(new UserRegistered({ userId: id, registeredAt: properties.registeredAt }));

    return user;
  }

  /** Rehydration from the repository: records no event. */
  static restore(id: UniqueEntityId, properties: UserProperties): User {
    return new User(id, properties);
  }

  get displayName(): DisplayName {
    return this.properties.displayName;
  }

  get email(): Email {
    return this.properties.email;
  }

  get registrationConsent(): RegistrationConsent {
    return this.properties.registrationConsent;
  }

  get registeredAt(): Date {
    return this.properties.registeredAt;
  }

  /**
   * Read by the repository on its way to the database. It appears in no DTO, no
   * presenter and no log line.
   */
  get passwordHash(): PasswordHash {
    return this.properties.passwordHash;
  }

  /** What sign-in verifies against, and the only thing it is allowed to learn. */
  get credential(): Credential {
    return Credential.of({
      email: this.properties.email,
      passwordHash: this.properties.passwordHash,
    });
  }

  /**
   * Sets a new password. Every session of this user is revoked by the use case
   * that calls it: the credential they were issued against no longer exists.
   */
  changePassword(passwordHash: PasswordHash, changedAt: Date): void {
    this.properties = { ...this.properties, passwordHash };
    this.addEvent(new PasswordChanged({ userId: this.id, changedAt }));
  }
}
