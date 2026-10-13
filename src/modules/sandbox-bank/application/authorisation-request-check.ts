import type { AppError } from '@shared/application/app-error.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import { SandboxBankError } from '../domain/sandbox-bank.errors.js';
import type { AuthorisationRequestInput } from './dto/bank-app.dto.js';
import type { ClientRegistry, RegisteredClient } from './ports/client-registry.port.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

export interface CheckedAuthorisationRequest {
  readonly client: RegisteredClient;
  readonly consent: Consent;
}

/**
 * The checks both halves of the authorisation screen run before anything else:
 * a client the bank knows, the exact redirect it registered, and a consent that
 * belongs to that client and is still waiting for an answer.
 *
 * A bad client or redirect is never redirected to — that is precisely where an
 * authorisation code must not go — so it fails here, on the bank's own screen.
 */
export class AuthorisationRequestCheck {
  constructor(
    private readonly clients: ClientRegistry,
    private readonly consents: ConsentRepository,
  ) {}

  async check(
    input: AuthorisationRequestInput,
    moment: Date,
  ): Promise<Result<CheckedAuthorisationRequest, AppError>> {
    const client = this.clients.findById(input.clientId);

    if (client === null || client.redirectUri !== input.redirectUri) {
      return fail(sandboxBankFailures.invalidAuthorisationRequest());
    }

    const consent = await this.consents.findByIdAndClientId(
      UniqueEntityId.restore(input.consentId),
      client.clientId,
    );

    if (consent === null) {
      return fail(sandboxBankFailures.consentNotFound());
    }

    if (!consent.isAwaitingAuthorisationAt(moment)) {
      return fail(sandboxBankFailures.fromDomain(SandboxBankError.consentNotAwaitingAuthorisation()));
    }

    return ok({ client, consent });
  }
}
