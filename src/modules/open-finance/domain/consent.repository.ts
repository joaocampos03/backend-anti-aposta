import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from './consent.js';

export interface ConsentRepository {
  save(consent: Consent): Promise<void>;
  /** "Not yours" answers exactly like "does not exist". */
  findByIdAndUserId(consentId: UniqueEntityId, userId: UniqueEntityId): Promise<Consent | null>;
  /** The one that governs what this user is sharing right now, if any. */
  findAuthorisedByUserId(userId: UniqueEntityId, moment: Date): Promise<Consent | null>;
  findLatestByUserId(userId: UniqueEntityId): Promise<Consent | null>;
}
