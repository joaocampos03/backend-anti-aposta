import type { Clock } from '@shared/application/clock.port.js';
import type { PrismaTransactionClient } from '@shared/infrastructure/prisma.js';
import type { AuthorisedConsentPresence } from '../application/authorised-consent-presence.js';

/**
 * A read model, not an aggregate: one indexed count, no hydration. The `Consent`
 * aggregate and its whole authorisation flow belong to the Open Finance feature;
 * what registration needs is only the answer `false` for a brand-new user.
 */
export class AuthorisedConsentQuery implements AuthorisedConsentPresence {
  constructor(
    private readonly client: PrismaTransactionClient,
    private readonly clock: Clock,
  ) {}

  async hasAuthorisedConsent(userId: string): Promise<boolean> {
    const authorised = await this.client.consent.count({
      where: { userId, status: 'AUTHORISED', expiresAt: { gt: this.clock.now() } },
    });

    return authorised > 0;
  }
}
