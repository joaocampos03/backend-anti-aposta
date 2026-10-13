import type { Consent } from '../domain/consent.js';
import type { ConsentDto } from './dto/consent.dto.js';

/** The one way a consent leaves this layer: primitives, read at one instant. */
export function toConsentDto(consent: Consent, moment: Date): ConsentDto {
  return {
    id: consent.id.value,
    status: consent.statusAt(moment),
    syncStatus: consent.syncStatusAt(moment),
    createdAt: consent.createdAt.toISOString(),
    expiresAt: consent.expiresAt.toISOString(),
    lastSyncedAt: consent.lastSyncedAt?.toISOString() ?? null,
  };
}
