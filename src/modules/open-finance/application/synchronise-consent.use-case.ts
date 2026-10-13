import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { ConsentAccessTokens } from './consent-access-tokens.js';
import { toConsentDto } from './consent-view.js';
import type { ConsentCommandInput, SynchronisationOutput } from './dto/consent.dto.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type { StatementSynchronisation } from './statement-synchronisation.js';

/**
 * `POST /api/v1/consents/{consentId}/synchronisation`: read again what the
 * institution shares, and ingest what is new since last time.
 *
 * This is how an entry booked at the bank reaches the statement — the way it
 * would from a real institution, by asking, never by the bank reaching in.
 * Pressing it twice ingests nothing the second time.
 */
export class SynchroniseConsent implements UseCase<ConsentCommandInput, SynchronisationOutput> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly accessTokens: ConsentAccessTokens,
    private readonly synchronisation: StatementSynchronisation,
    private readonly clock: Clock,
  ) {}

  async execute(input: ConsentCommandInput): Promise<Result<SynchronisationOutput, AppError>> {
    const now = this.clock.now();
    const consent = await this.consents.findByIdAndUserId(
      UniqueEntityId.restore(input.consentId),
      UniqueEntityId.restore(input.userId),
    );

    if (consent === null) {
      return fail(openFinanceFailures.consentNotFound());
    }

    const authorised = consent.authoriseIngestionAt(now);

    if (!authorised.ok) {
      return fail(openFinanceFailures.fromDomain(authorised.error));
    }

    const accessToken = await this.accessTokens.currentFor(consent, now);

    if (!accessToken.ok) {
      return accessToken;
    }

    const synchronised = await this.synchronisation.synchronise(consent, accessToken.value, now);

    if (!synchronised.ok) {
      return synchronised;
    }

    return ok({ consent: toConsentDto(consent, now), ingestedCount: synchronised.value });
  }
}
