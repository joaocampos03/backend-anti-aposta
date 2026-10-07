import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import {
  isUniqueViolationOn,
  type PrismaTransactionClient,
} from '@shared/infrastructure/prisma.js';
import type { Email } from '../domain/email.js';
import { EmailCollisionError } from '../domain/identity.errors.js';
import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import { UserMapper } from './user.mapper.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async save(user: User): Promise<void> {
    const row = UserMapper.toRow(user);

    try {
      await this.client.user.upsert({ where: { id: row.id }, create: row, update: row });
    } catch (cause) {
      // The unique index is the backstop for two simultaneous registrations of
      // the same address: the use case answers the same 409 its own check would.
      if (isUniqueViolationOn(cause, 'email')) {
        throw new EmailCollisionError();
      }

      throw cause;
    }
  }

  async findById(id: UniqueEntityId): Promise<User | null> {
    const row = await this.client.user.findUnique({ where: { id: id.value } });

    return row === null ? null : UserMapper.toDomain(row);
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.client.user.findUnique({ where: { email: email.value } });

    return row === null ? null : UserMapper.toDomain(row);
  }

  async existsWithEmail(email: Email): Promise<boolean> {
    const found = await this.client.user.findUnique({
      where: { email: email.value },
      select: { id: true },
    });

    return found !== null;
  }
}
