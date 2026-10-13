import type { Clock } from '@shared/application/clock.port.js';
import type { TokenScope } from '../domain/issued-token.js';
import type { IssuedTokenRepository } from '../domain/issued-token.repository.js';
import type { BankSecrets } from './ports/bank-secrets.port.js';

export interface TokenHolder {
  readonly clientId: string;
  /** Null for a client-credentials token. */
  readonly consentId: string | null;
}

/**
 * What a resource endpoint asks of a bearer token before it answers: is it a
 * live access token for this scope, and on whose behalf. Anything else — no
 * token, an unknown one, a refresh token, the wrong scope — is `null`, and the
 * endpoint answers 401 without saying which.
 */
export class AccessTokenIntrospection {
  constructor(
    private readonly tokens: IssuedTokenRepository,
    private readonly secrets: BankSecrets,
    private readonly clock: Clock,
  ) {}

  async holderOf(presented: string, scope: TokenScope): Promise<TokenHolder | null> {
    if (presented.length === 0) {
      return null;
    }

    const token = await this.tokens.findByFingerprint(this.secrets.fingerprint(presented));

    if (token === null || !token.grantsAccessAt(scope, this.clock.now())) {
      return null;
    }

    return { clientId: token.clientId, consentId: token.consentId?.value ?? null };
  }
}
