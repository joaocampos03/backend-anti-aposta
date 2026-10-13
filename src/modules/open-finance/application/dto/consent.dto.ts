import type { ConsentStatus, SyncStatus } from '../../domain/consent.js';

export interface ConsentDto {
  readonly id: string;
  /** As the person should read it: an authorised consent past its expiry is `EXPIRED`. */
  readonly status: ConsentStatus;
  readonly syncStatus: SyncStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastSyncedAt: string | null;
}

export interface ConsentCallerInput {
  readonly userId: string;
}

export interface ConsentCommandInput extends ConsentCallerInput {
  readonly consentId: string;
}

export interface RequestConsentOutput {
  readonly consent: ConsentDto;
  /** Where the browser goes next: the DataHolder's authorisation screen. */
  readonly authorisationUrl: string;
}

export interface CompleteAuthorisationInput extends ConsentCommandInput {
  readonly state: string;
  /** Null when the DataHolder sent the person back without one — they said no. */
  readonly code: string | null;
}

export interface SynchronisationOutput {
  readonly consent: ConsentDto;
  /** New transactions this run; zero when nothing changed at the institution. */
  readonly ingestedCount: number;
}

/** A DataHolder's "this consent's resources changed", reduced to the consent it names. */
export interface DataHolderNoticeInput {
  readonly externalConsentId: string;
}

export interface NoticeOutcome {
  readonly ingestedCount: number;
}

export interface CurrentConsentOutput {
  readonly consent: ConsentDto | null;
}
