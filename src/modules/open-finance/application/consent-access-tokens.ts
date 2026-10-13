import type { AppError } from '@shared/application/app-error.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { Consent } from '../domain/consent.js';
import { openFinanceFailures } from './open-finance.failures.js';
import type { ConsentTokenVault } from './ports/consent-token-vault.port.js';
import type { DataHolder } from './ports/data-holder.port.js';

/** Refresh a little early rather than race the expiry mid-statement. */
const EXPIRY_MARGIN_IN_SECONDS = 30;
const MILLISECONDS_IN_A_SECOND = 1000;

/**
 * A usable access token for an authorised consent: the stored one while it
 * lasts, a refreshed one after that. The DataHolder rotates the refresh token
 * on every use, so the new pair replaces the old one in the vault at once.
 */
export class ConsentAccessTokens {
  constructor(
    private readonly vault: ConsentTokenVault,
    private readonly dataHolder: DataHolder,
  ) {}

  async currentFor(consent: Consent, moment: Date): Promise<Result<string, AppError>> {
    const stored = await this.vault.find(consent.id.value);

    if (stored === null) {
      return fail(openFinanceFailures.fromDataHolder('REFUSED'));
    }

    const freshUntil = new Date(moment.getTime() + EXPIRY_MARGIN_IN_SECONDS * MILLISECONDS_IN_A_SECOND);

    if (stored.accessTokenExpiresAt > freshUntil) {
      return ok(stored.accessToken);
    }

    const refreshed = await this.dataHolder.refresh(stored.refreshToken);

    if (!refreshed.ok) {
      return fail(openFinanceFailures.fromDataHolder(refreshed.error));
    }

    await this.vault.store({
      consentId: consent.id.value,
      userId: consent.userId.value,
      tokens: refreshed.value,
    });

    return ok(refreshed.value.accessToken);
  }
}
