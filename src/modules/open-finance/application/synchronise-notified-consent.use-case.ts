import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { ConsentAccessTokens } from './consent-access-tokens.js';
import type { DataHolderNoticeInput, NoticeOutcome } from './dto/consent.dto.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type { StatementSynchronisation } from './statement-synchronisation.js';

/**
 * `POST /api/v1/data-holder-notices`: the institution says a consent's
 * resources changed, and the platform reads them — the same synchronisation
 * the "Sincronizar" button runs, started by the bank instead of a person.
 *
 * The notice is a prompt, never data. It names a consent and nothing else; the
 * movements are still pulled over the protocol with the consent's own token,
 * and the consent gate in `Transaction.ingest` still asks every time. A notice
 * about a consent that is gone or was revoked reads nothing.
 */
export class SynchroniseNotifiedConsent implements UseCase<DataHolderNoticeInput, NoticeOutcome> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly accessTokens: ConsentAccessTokens,
    private readonly synchronisation: StatementSynchronisation,
    private readonly clock: Clock,
  ) {}

  async execute(input: DataHolderNoticeInput): Promise<Result<NoticeOutcome, AppError>> {
    const now = this.clock.now();
    const consent = await this.consents.findByExternalConsentId(input.externalConsentId);

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

    return synchronised.ok ? ok({ ingestedCount: synchronised.value }) : synchronised;
  }
}
