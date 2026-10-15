import { Money } from '@shared/domain/money.js';
import type { DetectionConfidence, DetectionReason } from '../domain/bet-classification.js';
import { BetEntry } from '../domain/bet-entry.js';
import { BookmakerIdentity, type RegistryStatus } from '../domain/bookmaker-identity.js';

/**
 * Arranges one classified movement. A forty-line object literal in every test
 * hides which field the test is actually about.
 */
export class BetEntryBuilder {
  private occurredAt = new Date('2026-10-10T02:52:00.000Z');
  private amountInCents = -10_000;
  private name = 'Aposta Andorinha';
  private bookmakerId = 'bkm_unregistered_0d3c4f2a';
  private registryStatus: RegistryStatus = 'UNREGISTERED';
  private matchedBy: DetectionReason = 'GAMBLING_MCC';
  private confidence: DetectionConfidence = 'HIGH';

  at(occurredAt: Date): this {
    this.occurredAt = occurredAt;

    return this;
  }

  /** Signed: a debit is a bet placed, a credit is a refund. */
  of(amountInCents: number): this {
    this.amountInCents = amountInCents;

    return this;
  }

  from(input: {
    readonly bookmakerId: string;
    readonly name?: string;
    readonly registryStatus?: RegistryStatus;
  }): this {
    this.bookmakerId = input.bookmakerId;
    this.name = input.name ?? this.name;
    this.registryStatus = input.registryStatus ?? this.registryStatus;

    return this;
  }

  matchedByPolicy(matchedBy: DetectionReason, confidence: DetectionConfidence): this {
    this.matchedBy = matchedBy;
    this.confidence = confidence;

    return this;
  }

  build(): BetEntry {
    return BetEntry.of({
      occurredAt: this.occurredAt,
      amount: Money.restore(this.amountInCents),
      bookmaker: BookmakerIdentity.restore({
        bookmakerId: this.bookmakerId,
        name: this.name,
        registryStatus: this.registryStatus,
      }),
      matchedBy: this.matchedBy,
      confidence: this.confidence,
    });
  }
}

export function aBetEntry(): BetEntryBuilder {
  return new BetEntryBuilder();
}
