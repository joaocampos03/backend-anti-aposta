import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { ConsentCommandInput } from './dto/consent.dto.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type { DataHolder } from './ports/data-holder.port.js';

/**
 * `POST /api/v1/consents/{consentId}/revocation`: the person withdraws.
 *
 * The consent is revoked here first and the `ConsentRevoked` subscribers delete
 * everything derived from it — transactions, accounts, classifications, tokens
 * (LGPD art. 18). Telling the institution comes after, and its failure does not
 * undo any of that: the person's withdrawal cannot depend on a third party
 * being up. Revoking twice is harmless.
 */
export class RevokeConsent implements UseCase<ConsentCommandInput, void> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly dataHolder: DataHolder,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
  ) {}

  async execute(input: ConsentCommandInput): Promise<Result<void, AppError>> {
    const consent = await this.consents.findByIdAndUserId(
      UniqueEntityId.restore(input.consentId),
      UniqueEntityId.restore(input.userId),
    );

    if (consent === null) {
      return fail(openFinanceFailures.consentNotFound());
    }

    consent.revoke(this.clock.now());
    await this.consents.save(consent);
    await this.events.publish(consent.pullEvents());

    // Best effort by design: the outcome is recorded by the institution, and
    // nothing on this side waits for it.
    await this.dataHolder.revokeConsent(consent.externalConsentId);

    return ok(undefined);
  }
}
