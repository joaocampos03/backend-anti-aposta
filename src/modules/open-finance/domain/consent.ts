import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { ConsentRevoked } from './events/consent-revoked.js';
import { OpenFinanceError } from './open-finance.errors.js';

export type ConsentStatus =
  | 'AWAITING_AUTHORISATION'
  | 'AUTHORISED'
  | 'REJECTED'
  | 'REVOKED'
  | 'EXPIRED';

/** What the screens need to know about a user's connection, in one word. */
export type SyncStatus = 'NO_CONSENT' | 'SYNCING' | 'READY';

interface ConsentProperties {
  readonly userId: UniqueEntityId;
  readonly status: ConsentStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** `null` until the first ingestion finishes. */
  readonly lastSyncedAt: Date | null;
}

/**
 * The user's authorisation to share financial data.
 *
 * **No transaction may exist against a consent that is not `AUTHORISED`**, and
 * that is enforced here rather than in a use case: it is the invariant the
 * whole LGPD story rests on, and a rule that lives in one caller is a rule the
 * next caller forgets.
 *
 * This is not the `RegistrationConsent` of `identity`: different scope, an
 * expiry, an authorisation flow at a bank, and revocable.
 */
export class Consent extends AggregateRoot {
  private properties: ConsentProperties;

  private constructor(id: UniqueEntityId, properties: ConsentProperties) {
    super(id);
    this.properties = properties;
  }

  static restore(id: UniqueEntityId, properties: ConsentProperties): Consent {
    return new Consent(id, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get status(): ConsentStatus {
    return this.properties.status;
  }

  get createdAt(): Date {
    return this.properties.createdAt;
  }

  get expiresAt(): Date {
    return this.properties.expiresAt;
  }

  get lastSyncedAt(): Date | null {
    return this.properties.lastSyncedAt;
  }

  isAuthorisedAt(moment: Date): boolean {
    return this.properties.status === 'AUTHORISED' && moment < this.properties.expiresAt;
  }

  /**
   * The gate every ingestion passes through. A consent that lapsed answers the
   * same as one that was refused: no.
   */
  authoriseIngestionAt(moment: Date): Result<void, OpenFinanceError<'CONSENT_NOT_AUTHORISED'>> {
    if (!this.isAuthorisedAt(moment)) {
      return fail(OpenFinanceError.consentNotAuthorised());
    }

    return ok(undefined);
  }

  markSynced(moment: Date): void {
    this.properties = { ...this.properties, lastSyncedAt: moment };
  }

  /** Records the event whose subscriber deletes everything derived from it. */
  revoke(moment: Date): void {
    if (this.properties.status === 'REVOKED') {
      return;
    }

    this.properties = { ...this.properties, status: 'REVOKED', lastSyncedAt: null };
    this.addEvent(
      new ConsentRevoked({
        userId: this.properties.userId,
        consentId: this.id,
        revokedAt: moment,
      }),
    );
  }

  /**
   * An empty list is three different screens, so the state is computed here and
   * sent explicitly rather than inferred from the absence of rows. A zero where
   * a user has simply never connected an account reads as "you spent nothing on
   * bets", which the data does not say.
   */
  syncStatusAt(moment: Date): SyncStatus {
    if (!this.isAuthorisedAt(moment)) {
      return 'NO_CONSENT';
    }

    return this.properties.lastSyncedAt === null ? 'SYNCING' : 'READY';
  }
}
