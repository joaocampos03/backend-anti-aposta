import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { AuthorisationRequest } from '../domain/authorisation-request.js';
import type { AuthorisationRequestRepository } from '../domain/authorisation-request.repository.js';
import { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { toConsentDto } from './consent-view.js';
import type { ConsentCallerInput, RequestConsentOutput } from './dto/consent.dto.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type { AuthorisationSecrets } from './ports/authorisation-secrets.port.js';
import type { DataHolder } from './ports/data-holder.port.js';

/**
 * How long the person is asked to share for. Open Finance Brasil allows up to
 * twelve months; six is an assumed default that keeps the exposure shorter, and
 * it matches the consents the seed and the fixtures have always used.
 */
export const CONSENT_LIFETIME_IN_DAYS = 180;
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export interface RequestConsentDependencies {
  readonly consents: ConsentRepository;
  readonly authorisationRequests: AuthorisationRequestRepository;
  readonly dataHolder: DataHolder;
  readonly secrets: AuthorisationSecrets;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * `POST /api/v1/consents`: the start of the flow. Registers the consent at the
 * DataHolder, keeps the `state` and the PKCE verifier for the callback, and
 * answers with the URL the browser goes to next.
 *
 * Nothing is read yet. One authorised consent at a time: connecting another
 * institution means revoking the current one first, so the person always knows
 * exactly what is being shared.
 */
export class RequestConsent implements UseCase<ConsentCallerInput, RequestConsentOutput> {
  constructor(private readonly dependencies: RequestConsentDependencies) {}

  async execute(input: ConsentCallerInput): Promise<Result<RequestConsentOutput, AppError>> {
    const now = this.dependencies.clock.now();
    const userId = UniqueEntityId.restore(input.userId);

    if ((await this.dependencies.consents.findAuthorisedByUserId(userId, now)) !== null) {
      return fail(openFinanceFailures.consentAlreadyAuthorised());
    }

    const expiresAt = new Date(now.getTime() + CONSENT_LIFETIME_IN_DAYS * MILLISECONDS_IN_A_DAY);
    const registered = await this.dependencies.dataHolder.createConsent({ expiresAt });

    if (!registered.ok) {
      return fail(openFinanceFailures.fromDataHolder(registered.error));
    }

    const consent = Consent.request({
      id: this.dependencies.idGenerator.generate(),
      userId,
      externalConsentId: registered.value.externalConsentId,
      createdAt: now,
      expiresAt,
    });

    const authorisationUrl = await this.openAuthorisation(consent, now);

    return ok({ consent: toConsentDto(consent, now), authorisationUrl });
  }

  private async openAuthorisation(consent: Consent, now: Date): Promise<string> {
    const { secrets } = this.dependencies;
    const state = secrets.generateState();
    const codeVerifier = secrets.generateCodeVerifier();

    await this.dependencies.consents.save(consent);
    await this.dependencies.authorisationRequests.save(
      AuthorisationRequest.open({
        consentId: consent.id,
        userId: consent.userId,
        stateFingerprint: secrets.fingerprint(state),
        codeVerifier,
        createdAt: now,
      }),
    );

    return this.dependencies.dataHolder.authorisationUrl({
      externalConsentId: consent.externalConsentId,
      state,
      codeChallenge: secrets.challengeOf(codeVerifier),
    });
  }
}
