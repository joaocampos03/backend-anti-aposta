import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from './consent.js';

export interface ConsentRepository {
  save(consent: Consent): Promise<void>;
  /** The one that governs what this user is sharing right now, if any. */
  findAuthorisedByUserId(userId: UniqueEntityId, moment: Date): Promise<Consent | null>;
  findLatestByUserId(userId: UniqueEntityId): Promise<Consent | null>;
}
