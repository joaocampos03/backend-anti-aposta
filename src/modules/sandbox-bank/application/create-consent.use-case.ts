import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { Consent } from '../domain/consent.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { ConsentDto, CreateConsentInput } from './dto/protocol.dto.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

/**
 * `POST /consents`: a DataRecipient states what it wants to read and for how
 * long. The consent starts unowned — the bank learns whose it is only when a
 * customer authorises it.
 */
export class CreateConsent implements UseCase<CreateConsentInput, ConsentDto> {
  constructor(
    private readonly consents: ConsentRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateConsentInput): Promise<Result<ConsentDto, AppError>> {
    const requested = Consent.request({
      id: this.idGenerator.generate(),
      clientId: input.clientId,
      permissions: input.permissions,
      createdAt: this.clock.now(),
      expiresAt: input.expiresAt,
    });

    if (!requested.ok) {
      return fail(sandboxBankFailures.fromDomain(requested.error));
    }

    await this.consents.save(requested.value);

    return ok(toConsentDto(requested.value));
  }
}

export function toConsentDto(consent: Consent): ConsentDto {
  return {
    consentId: consent.id.value,
    status: consent.status,
    permissions: consent.permissions,
    createdAt: consent.createdAt.toISOString(),
    statusUpdatedAt: consent.statusUpdatedAt.toISOString(),
    expiresAt: consent.expiresAt.toISOString(),
  };
}
