import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { RegisteredClient } from './client-registry.port.js';

/**
 * The bank telling a DataRecipient "the resources behind this consent changed —
 * read them again". It names the consent and nothing else: no movement, no
 * amount, no customer. The recipient still pulls the statement over the
 * protocol with its own token, so the notice can never become a side channel
 * for data the consent does not cover.
 *
 * Best effort by nature. A recipient that is down is the recipient's problem —
 * the entry is booked either way, and its next synchronisation reads it.
 */
export interface DataRecipientNotifier {
  resourcesChanged(input: {
    readonly client: RegisteredClient;
    readonly consentId: UniqueEntityId;
  }): Promise<void>;
}
