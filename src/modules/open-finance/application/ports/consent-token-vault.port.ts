import type { DataHolderTokens } from './data-holder.port.js';

/**
 * Where the DataHolder's tokens are kept. The adapter encrypts them at rest
 * (AES-256-GCM); in this layer they are plain strings that never reach a DTO, a
 * response, an event or a log line.
 */
export interface ConsentTokenVault {
  store(input: {
    readonly consentId: string;
    readonly userId: string;
    readonly tokens: DataHolderTokens;
  }): Promise<void>;
  find(consentId: string): Promise<DataHolderTokens | null>;
  /** Revocation deletes the tokens with everything else. */
  deleteAllForUser(userId: string): Promise<void>;
}
