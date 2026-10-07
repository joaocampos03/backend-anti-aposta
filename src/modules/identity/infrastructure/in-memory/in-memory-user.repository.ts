import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Email } from '../../domain/email.js';
import type { User } from '../../domain/user.js';
import type { UserRepository } from '../../domain/user.repository.js';

/** The fake this module ships for unit tests. No database, no mocking framework. */
export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];

  async save(user: User): Promise<void> {
    const index = this.users.findIndex((stored) => stored.id.equals(user.id));

    if (index >= 0) {
      this.users.splice(index, 1, user);

      return;
    }

    this.users.push(user);
  }

  async findById(id: UniqueEntityId): Promise<User | null> {
    return this.users.find((stored) => stored.id.equals(id)) ?? null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    return this.users.find((stored) => stored.email.equals(email)) ?? null;
  }

  async existsWithEmail(email: Email): Promise<boolean> {
    return this.users.some((stored) => stored.email.equals(email));
  }
}
