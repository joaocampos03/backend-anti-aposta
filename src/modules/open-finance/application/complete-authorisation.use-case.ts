import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { EventPublisher } from '@shared/application/event-publisher.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { AuthorisationRequest } from '../domain/authorisation-request.js';
import type { AuthorisationRequestRepository } from '../domain/authorisation-request.repository.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { toConsentDto } from './consent-view.js';
import type {
  CompleteAuthorisationInput,
  SynchronisationOutput,
} from './dto/consent.dto.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type { AuthorisationSecrets } from './ports/authorisation-secrets.port.js';
import type { ConsentTokenVault } from './ports/consent-token-vault.port.js';
import type { DataHolder } from './ports/data-holder.port.js';
import type { StatementSynchronisation } from './statement-synchronisation.js';

export interface CompleteAuthorisationDependencies {
  readonly consents: ConsentRepository;
  readonly authorisationRequests: AuthorisationRequestRepository;
  readonly dataHolder: DataHolder;
  readonly secrets: AuthorisationSecrets;
  readonly vault: ConsentTokenVault;
  readonly synchronisation: StatementSynchronisation;
  readonly clock: Clock;
  readonly events: EventPublisher;
}

/**
 * `POST /api/v1/consents/{consentId}/authorisation`: the callback, relayed by
 * the frontend. The `state` must be the one this platform sent; a mismatch
 * records nothing at all — it is a forged redirect or somebody else's.
 *
 * With a code, the code and the PKCE verifier are exchanged for tokens, the
 * consent becomes `AUTHORISED`, and the first synchronisation runs at once so
 * the statement is ready when the person lands back. Without one, the person
 * said no at the institution and the consent is `REJECTED`.
 */
export class CompleteAuthorisation
  implements UseCase<CompleteAuthorisationInput, SynchronisationOutput>
{
  constructor(private readonly dependencies: CompleteAuthorisationDependencies) {}

  async execute(
    input: CompleteAuthorisationInput,
  ): Promise<Result<SynchronisationOutput, AppError>> {
    const now = this.dependencies.clock.now();
    const pending = await this.pendingFor(input, now);

    if (!pending.ok) {
      return pending;
    }

    const { consent, request } = pending.value;
    await this.dependencies.authorisationRequests.delete(consent.id);

    if (input.code === null) {
      return await this.reject(consent, now);
    }

    return await this.authorise(consent, request, input.code, now);
  }

  private async pendingFor(
    input: CompleteAuthorisationInput,
    now: Date,
  ): Promise<Result<{ consent: Consent; request: AuthorisationRequest }, AppError>> {
    const consentId = UniqueEntityId.restore(input.consentId);
    const userId = UniqueEntityId.restore(input.userId);
    const consent = await this.dependencies.consents.findByIdAndUserId(consentId, userId);

    if (consent === null) {
      return fail(openFinanceFailures.consentNotFound());
    }

    const request = await this.dependencies.authorisationRequests.findByConsentIdAndUserId(
      consentId,
      userId,
    );

    if (request === null) {
      return fail(openFinanceFailures.authorisationNotPending());
    }

    const verified = request.verify(this.dependencies.secrets.fingerprint(input.state), now);

    return verified.ok
      ? ok({ consent, request })
      : fail(openFinanceFailures.fromDomain(verified.error));
  }

  private async reject(consent: Consent, now: Date): Promise<Result<SynchronisationOutput, AppError>> {
    const rejected = consent.reject(now);

    if (!rejected.ok) {
      return fail(openFinanceFailures.fromDomain(rejected.error));
    }

    await this.dependencies.consents.save(consent);

    return ok({ consent: toConsentDto(consent, now), ingestedCount: 0 });
  }

  private async authorise(
    consent: Consent,
    request: AuthorisationRequest,
    code: string,
    now: Date,
  ): Promise<Result<SynchronisationOutput, AppError>> {
    const tokens = await this.dependencies.dataHolder.exchangeCode({
      code,
      codeVerifier: request.codeVerifier,
    });

    if (!tokens.ok) {
      return fail(openFinanceFailures.fromDataHolder(tokens.error));
    }

    const authorised = consent.authorise(now);

    if (!authorised.ok) {
      return fail(openFinanceFailures.fromDomain(authorised.error));
    }

    await this.dependencies.consents.save(consent);
    await this.dependencies.vault.store({
      consentId: consent.id.value,
      userId: consent.userId.value,
      tokens: tokens.value,
    });
    await this.dependencies.events.publish(consent.pullEvents());

    return await this.firstSynchronisation(consent, tokens.value.accessToken, now);
  }

  private async firstSynchronisation(
    consent: Consent,
    accessToken: string,
    now: Date,
  ): Promise<Result<SynchronisationOutput, AppError>> {
    const synchronised = await this.dependencies.synchronisation.synchronise(
      consent,
      accessToken,
      now,
    );

    if (!synchronised.ok) {
      return synchronised;
    }

    return ok({ consent: toConsentDto(consent, now), ingestedCount: synchronised.value });
  }
}
