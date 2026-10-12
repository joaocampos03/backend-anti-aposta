import type { ConnectedAccount as ConnectedAccountRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { ConnectedAccount } from '../domain/connected-account.js';
import { MaskedAccountNumber } from '../domain/masked-account-number.js';

export class ConnectedAccountMapper {
  static toDomain(row: ConnectedAccountRow): ConnectedAccount {
    return ConnectedAccount.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      consentId: UniqueEntityId.restore(row.consentId),
      institution: row.institution,
      shortName: row.shortName,
      product: row.product,
      maskedNumber: MaskedAccountNumber.restore(row.maskedNumber),
      kind: row.kind,
      connectedAt: row.connectedAt,
    });
  }

  static toRow(account: ConnectedAccount): ConnectedAccountRow {
    return {
      id: account.id.value,
      userId: account.userId.value,
      consentId: account.consentId.value,
      institution: account.institution,
      shortName: account.shortName,
      product: account.product,
      maskedNumber: account.maskedNumber.value,
      kind: account.kind,
      connectedAt: account.connectedAt,
    };
  }
}
