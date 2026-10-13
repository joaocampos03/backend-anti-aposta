import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from './consent.js';

export interface ConsentRepository {
  save(consent: Consent): Promise<void>;
  findById(consentId: UniqueEntityId): Promise<Consent | null>;
  /** "Not yours" and "does not exist" are the same answer to a client. */
  findByIdAndClientId(consentId: UniqueEntityId, clientId: string): Promise<Consent | null>;
}
