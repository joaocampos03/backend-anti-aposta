import type { RequestHandler } from 'express';
import type { ValidatedBody } from '@shared/http/validate.js';
import type { SynchroniseNotifiedConsent } from '../application/synchronise-notified-consent.use-case.js';
import type { DataHolderNoticeBody } from './open-finance.schemas.js';

const NO_CONTENT = 204;

/**
 * The institution's side door. It has no caller session: the institution is
 * not a person, and what it may say is limited to "look again".
 */
export class DataHolderNoticeController {
  constructor(
    private readonly synchroniseNotifiedConsent: SynchroniseNotifiedConsent,
    private readonly body: ValidatedBody<DataHolderNoticeBody>,
  ) {}

  readonly receive: RequestHandler = async (request, response, next) => {
    const result = await this.synchroniseNotifiedConsent.execute({
      externalConsentId: this.body.read(request).data.consentId,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(NO_CONTENT).end();
  };
}
