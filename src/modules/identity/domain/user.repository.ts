import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Email } from './email.js';
import type { User } from './user.js';

export interface UserRepository {
  /**
   * @throws EmailCollisionError when the unique index rejects the e-mail.
   */
  save(user: User): Promise<void>;
  findById(id: UniqueEntityId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  existsWithEmail(email: Email): Promise<boolean>;
}
