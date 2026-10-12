import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { toConsentDto } from './consent-view.js';
import type { ConsentCallerInput, CurrentConsentOutput } from './dto/consent.dto.js';

/**
 * `GET /api/v1/consents/current`: what the accounts screen needs to offer
 * "conectar", "sincronizar" or "revogar" — the latest consent and its status
 * as the person should read it. `null` is "never connected", not a failure.
 */
export class GetCurrentConsent implements UseCase<ConsentCallerInput, CurrentConsentOutput> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ConsentCallerInput): Promise<Result<CurrentConsentOutput, AppError>> {
    const consent = await this.consents.findLatestByUserId(UniqueEntityId.restore(input.userId));

    return ok({ consent: consent === null ? null : toConsentDto(consent, this.clock.now()) });
  }
}
