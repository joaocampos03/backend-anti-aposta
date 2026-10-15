import type { Transaction as TransactionRow } from '@prisma/client';
import { Money } from '@shared/domain/money.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { Counterparty } from '../domain/counterparty.js';
import { Transaction } from '../domain/transaction.js';

export class TransactionMapper {
  static toDomain(row: TransactionRow): Transaction {
    return Transaction.restore(UniqueEntityId.restore(row.id), {
      userId: UniqueEntityId.restore(row.userId),
      accountId: UniqueEntityId.restore(row.accountId),
      externalId: row.externalId,
      occurredAt: row.occurredAt,
      amount: Money.restore(row.amountInCents),
      counterparty: Counterparty.restore(row.counterparty),
      category: row.category,
      method: row.method,
      status: row.status,
      betMark:
        row.betMatchedBy === null || row.betConfidence === null || row.betSource === null
          ? null
          : {
              matchedBy: row.betMatchedBy,
              confidence: row.betConfidence,
              source: row.betSource,
              bookmakerId: row.betBookmakerId,
            },
    });
  }

  static toRow(transaction: Transaction, ingestedAt: Date): TransactionRow {
    const mark = transaction.betMark;

    return {
      id: transaction.id.value,
      userId: transaction.userId.value,
      accountId: transaction.accountId.value,
      externalId: transaction.externalId,
      occurredAt: transaction.occurredAt,
      amountInCents: transaction.amount.amountInCents,
      counterparty: transaction.counterparty.value,
      category: transaction.category,
      method: transaction.method,
      status: transaction.status,
      ingestedAt,
      betMatchedBy: mark?.matchedBy ?? null,
      betConfidence: mark?.confidence ?? null,
      betSource: mark?.source ?? null,
      betBookmakerId: mark?.bookmakerId ?? null,
      overriddenAt: null,
    };
  }
}
