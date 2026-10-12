import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConnectedAccount } from './connected-account.js';

export interface ConnectedAccountRepository {
  save(account: ConnectedAccount): Promise<void>;
  /** Ordered by connection date, so the filter's order is stable between visits. */
  findByConsentId(consentId: UniqueEntityId): Promise<readonly ConnectedAccount[]>;
  findByIdAndUserId(
    accountId: UniqueEntityId,
    userId: UniqueEntityId,
  ): Promise<ConnectedAccount | null>;
  deleteAllForUser(userId: UniqueEntityId): Promise<void>;
}
