import type { RegistryStatus } from '../../domain/bookmaker-identity.js';

export interface BookmakerIdentityRow {
  readonly bookmakerId: string;
  readonly name: string;
  readonly registryStatus: RegistryStatus;
}

/**
 * What to call each house in this reader's history, from this context's own
 * table.
 *
 * It is a read model rather than a repository method: the betting screen needs
 * one row per bookmaker, not five thousand hydrated classifications to compute
 * a name from.
 */
export interface BookmakerIdentityQuery {
  forUserId(userId: string): Promise<readonly BookmakerIdentityRow[]>;
}
