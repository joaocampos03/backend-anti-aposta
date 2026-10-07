import type { PrismaClient } from '@prisma/client';
import type {
  IdentityTransaction,
  IdentityUnitOfWork,
} from '../application/ports/identity-unit-of-work.port.js';
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository.js';
import { PrismaSessionRepository } from './prisma-session.repository.js';
import { PrismaSignInThrottleRepository } from './prisma-sign-in-throttle.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

/** The only place in `identity` that opens a database transaction. */
export class PrismaIdentityUnitOfWork implements IdentityUnitOfWork {
  constructor(private readonly client: PrismaClient) {}

  async run<TResult>(
    work: (transaction: IdentityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return await this.client.$transaction(async (client) =>
      work({
        users: new PrismaUserRepository(client),
        sessions: new PrismaSessionRepository(client),
        signInThrottles: new PrismaSignInThrottleRepository(client),
        passwordResetTokens: new PrismaPasswordResetTokenRepository(client),
      }),
    );
  }
}
