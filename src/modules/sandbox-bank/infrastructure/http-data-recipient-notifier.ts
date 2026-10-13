import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Logger } from '@shared/infrastructure/logger.js';
import type { RegisteredClient } from '../application/ports/client-registry.port.js';
import type { DataRecipientNotifier } from '../application/ports/data-recipient-notifier.port.js';

/** A booking waits on this, so a recipient that hangs must not hang the bank. */
const REQUEST_TIMEOUT_IN_MILLISECONDS = 5_000;

export interface DataRecipientNoticeSettings {
  /** The consent id as the protocol spells it, e.g. `urn:sandbox-bank:`. */
  readonly consentUrnPrefix: string;
  /** The enrolled client's secret: the bank proves who it is with the shared enrolment. */
  readonly clientSecret: string;
}

/**
 * Posts the notice to the address the client enrolled, in the Open Finance
 * `data` envelope, authenticated with the enrolment's credentials — the
 * sandbox's stand-in for the ecosystem's mutual TLS.
 *
 * A recipient that is down or refuses is logged by consent id and left alone:
 * the entry is already booked, and the next synchronisation reads it anyway.
 */
export class HttpDataRecipientNotifier implements DataRecipientNotifier {
  constructor(
    private readonly settings: DataRecipientNoticeSettings,
    private readonly logger: Logger,
  ) {}

  async resourcesChanged(input: {
    readonly client: RegisteredClient;
    readonly consentId: UniqueEntityId;
  }): Promise<void> {
    const response = await fetch(input.client.noticeUri, {
      method: 'POST',
      headers: {
        authorization: this.basicCredentialsFor(input.client),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        data: { consentId: `${this.settings.consentUrnPrefix}${input.consentId.value}` },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS),
    }).catch(() => null);

    if (response === null || !response.ok) {
      this.logger.warn(
        { consentId: input.consentId.value, status: response?.status ?? null },
        'data recipient did not take the notice',
      );
    }
  }

  private basicCredentialsFor(client: RegisteredClient): string {
    const credentials = `${client.clientId}:${this.settings.clientSecret}`;

    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }
}
