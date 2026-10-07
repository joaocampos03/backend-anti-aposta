import { createHash } from 'node:crypto';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { Email } from '../domain/email.js';
import type { SignInThrottle } from '../domain/sign-in-throttle.js';
import { SignInThrottle as Throttle } from '../domain/sign-in-throttle.js';
import type { SignInThrottleRepository } from '../domain/sign-in-throttle.repository.js';
import { SignInThrottleMapper } from './sign-in-throttle.mapper.js';

/**
 * The address is fingerprinted here, in the only layer allowed to know about
 * crypto, so the throttle table holds no addresses: a dump of it is not a list
 * of the people who tried to sign in to a product about gambling.
 */
export function fingerprintOf(email: Email): string {
  return createHash('sha256').update(email.value).digest('hex');
}

export class PrismaSignInThrottleRepository implements SignInThrottleRepository {
  constructor(private readonly client: PrismaTransactionClient) {}

  async findByEmail(email: Email): Promise<SignInThrottle> {
    const identifierHash = fingerprintOf(email);
    const row = await this.client.signInThrottle.findUnique({ where: { identifierHash } });

    return row === null ? Throttle.fresh(identifierHash) : SignInThrottleMapper.toDomain(row);
  }

  async save(throttle: SignInThrottle): Promise<void> {
    const row = SignInThrottleMapper.toRow(throttle);

    await this.client.signInThrottle.upsert({
      where: { identifierHash: row.identifierHash },
      create: row,
      update: row,
    });
  }
}
