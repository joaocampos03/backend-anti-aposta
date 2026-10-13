import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import type { AuthorisationRequestCheck } from './authorisation-request-check.js';
import { toCustomerAccountDto, type DemoAccountOpening } from './demo-account-opening.js';
import type {
  AuthorisationRequestInput,
  AuthorisationRequestOutput,
} from './dto/bank-app.dto.js';

/**
 * `GET /authorize`: what the bank's authorisation screen shows before the
 * customer decides — who is asking, for what, until when, and which of their
 * accounts they could share.
 *
 * The customer is the platform user whose session reached the screen. A real
 * bank would sign the customer in with its own credentials here; the sandbox
 * lets the platform session stand in for that login, and says so in its
 * CLAUDE.md rather than pretending otherwise.
 */
export class DescribeAuthorisationRequest
  implements UseCase<AuthorisationRequestInput, AuthorisationRequestOutput>
{
  constructor(
    private readonly requests: AuthorisationRequestCheck,
    private readonly demoAccounts: DemoAccountOpening,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AuthorisationRequestInput,
  ): Promise<Result<AuthorisationRequestOutput, AppError>> {
    const now = this.clock.now();
    const checked = await this.requests.check(input, now);

    if (!checked.ok) {
      return checked;
    }

    const accounts = await this.demoAccounts.ensureFor(UniqueEntityId.restore(input.customerId), now);
    const { client, consent } = checked.value;

    return ok({
      client: { displayName: client.displayName },
      consent: {
        id: consent.id.value,
        permissions: consent.permissions,
        expiresAt: consent.expiresAt.toISOString(),
      },
      accounts: accounts.map(toCustomerAccountDto),
    });
  }
}
