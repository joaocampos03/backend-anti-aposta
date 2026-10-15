import type { Clock } from '@shared/application/clock.port.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { SyncStatus } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';

/**
 * What `open-finance` publishes so another context's screen can tell "nothing
 * connected" from "connected but still loading" from "ready".
 *
 * It is answered from the `Consent` aggregate's own state, never from whether a
 * transaction happens to exist. A reader who has connected an account and has
 * no bets is in a different situation from one who has connected nothing, and a
 * zero shown for the second would read as "you spent nothing on bets" — a claim
 * the data does not support.
 */
export class SyncStatusLookup {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly clock: Clock,
  ) {}

  async statusOf(userId: string): Promise<SyncStatus> {
    const consent = await this.consents.findLatestByUserId(UniqueEntityId.restore(userId));

    return consent === null ? 'NO_CONSENT' : consent.syncStatusAt(this.clock.now());
  }
}
