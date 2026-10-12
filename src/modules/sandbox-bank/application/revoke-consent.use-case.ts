import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { IssuedTokenRepository } from '../domain/issued-token.repository.js';
import type { RevokeConsentInput } from './dto/protocol.dto.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

/**
 * `DELETE /consents/{consentId}`: the DataRecipient withdraws. Every token the
 * consent produced dies with it, so a copy kept anywhere stops working at once.
 *
 * Idempotent, because the recipient revokes on its own side first and may call
 * again after a timeout.
 */
export class RevokeConsent implements UseCase<RevokeConsentInput, void> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly tokens: IssuedTokenRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: RevokeConsentInput): Promise<Result<void, AppError>> {
    const consent = await this.consents.findByIdAndClientId(
      UniqueEntityId.restore(input.consentId),
      input.clientId,
    );

    if (consent === null) {
      return fail(sandboxBankFailures.consentNotFound());
    }

    const now = this.clock.now();
    consent.revoke(now);

    await this.consents.save(consent);
    await this.tokens.revokeAllForConsent(consent.id, now);

    return ok(undefined);
  }
}
