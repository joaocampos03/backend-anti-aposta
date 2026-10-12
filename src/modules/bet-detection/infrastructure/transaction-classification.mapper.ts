import type { TransactionClassification as ClassificationRow } from '@prisma/client';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { BetClassification } from '../domain/bet-classification.js';
import { Cnpj } from '../domain/cnpj.js';
import { DetectionSignals } from '../domain/detection-signals.js';
import { TransactionClassification } from '../domain/transaction-classification.js';

export class TransactionClassificationMapper {
  static toDomain(row: ClassificationRow): TransactionClassification {
    const document = row.counterpartyDocument === null ? null : Cnpj.create(row.counterpartyDocument);

    return TransactionClassification.restore(UniqueEntityId.restore(row.transactionId), {
      userId: UniqueEntityId.restore(row.userId),
      signals: DetectionSignals.of({
        mcc: row.mcc,
        counterpartyDocument: document !== null && document.ok ? document.value : null,
        description: row.description,
      }),
      policyVerdict:
        row.matchedBy === null || row.confidence === null
          ? null
          : BetClassification.restore({
              matchedBy: row.matchedBy,
              confidence: row.confidence,
              source: 'POLICY',
            }),
      override:
        row.overrideVerdict === null || row.overriddenAt === null
          ? null
          : {
              verdict: row.overrideVerdict,
              reason: row.overrideReason,
              overriddenAt: row.overriddenAt,
            },
      classifiedAt: row.classifiedAt,
    });
  }

  static toRow(classification: TransactionClassification): ClassificationRow {
    const verdict = classification.policyVerdict;
    const override = classification.override;

    return {
      transactionId: classification.id.value,
      userId: classification.userId.value,
      mcc: classification.signals.mcc,
      counterpartyDocument: classification.signals.counterpartyDocument?.digits ?? null,
      description: classification.signals.description,
      matchedBy: verdict?.matchedBy ?? null,
      confidence: verdict?.confidence ?? null,
      classifiedAt: classification.classifiedAt,
      overrideVerdict: override?.verdict ?? null,
      overrideReason: override?.reason ?? null,
      overriddenAt: override?.overriddenAt ?? null,
    };
  }
}
