import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from './consent.js';

export interface ConsentRepository {
  save(consent: Consent): Promise<void>;
  /** "Not yours" answers exactly like "does not exist". */
  findByIdAndUserId(consentId: UniqueEntityId, userId: UniqueEntityId): Promise<Consent | null>;
  /** The one that governs what this user is sharing right now, if any. */
  findAuthorisedByUserId(userId: UniqueEntityId, moment: Date): Promise<Consent | null>;
  findLatestByUserId(userId: UniqueEntityId): Promise<Consent | null>;
  /**
   * The consent a DataHolder's notice is about. The notice names the consent
   * by the institution's own id, the one its tokens are bound to; whose it is
   * comes from this row, never from the notice.
   */
  findByExternalConsentId(externalConsentId: string): Promise<Consent | null>;
}
