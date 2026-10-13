import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { IdGenerator } from '@shared/application/id-generator.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { AuthorisationCode } from '../domain/authorisation-code.js';
import type { AuthorisationCodeRepository } from '../domain/authorisation-code.repository.js';
import type { BankAccountRepository } from '../domain/bank-account.repository.js';
import type { ConsentRepository } from '../domain/consent.repository.js';
import type { AuthorisationRequestCheck, CheckedAuthorisationRequest } from './authorisation-request-check.js';
import type {
  DecideAuthorisationInput,
  DecideAuthorisationOutput,
} from './dto/bank-app.dto.js';
import type { BankSecrets } from './ports/bank-secrets.port.js';
import { sandboxBankFailures } from './sandbox-bank.failures.js';

/** RFC 6749 §4.1.2.1: what a client is told when the person said no. */
const ACCESS_DENIED = 'access_denied';

export interface DecideAuthorisationDependencies {
  readonly requests: AuthorisationRequestCheck;
  readonly consents: ConsentRepository;
  readonly accounts: BankAccountRepository;
  readonly codes: AuthorisationCodeRepository;
  readonly secrets: BankSecrets;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * `POST /authorize`: the customer's answer. Either way the browser is sent
 * back to the client's registered redirect with the `state` it brought — a
 * single-use code bound to the PKCE challenge on a yes, `access_denied` on a no.
 */
export class DecideAuthorisation
  implements UseCase<DecideAuthorisationInput, DecideAuthorisationOutput>
{
  constructor(private readonly dependencies: DecideAuthorisationDependencies) {}

  async execute(
    input: DecideAuthorisationInput,
  ): Promise<Result<DecideAuthorisationOutput, AppError>> {
    const now = this.dependencies.clock.now();
    const checked = await this.dependencies.requests.check(input, now);

    if (!checked.ok) {
      return checked;
    }

    if (input.decision === 'REJECT') {
      return await this.reject(checked.value, input, now);
    }

    return await this.approve(checked.value, input, now);
  }

  private async reject(
    { consent }: CheckedAuthorisationRequest,
    input: DecideAuthorisationInput,
    now: Date,
  ): Promise<Result<DecideAuthorisationOutput, AppError>> {
    const rejected = consent.reject(now);

    if (!rejected.ok) {
      return fail(sandboxBankFailures.fromDomain(rejected.error));
    }

    await this.dependencies.consents.save(consent);

    return ok({ redirectTo: redirectWith(input.redirectUri, { error: ACCESS_DENIED, state: input.state }) });
  }

  private async approve(
    { consent, client }: CheckedAuthorisationRequest,
    input: DecideAuthorisationInput,
    now: Date,
  ): Promise<Result<DecideAuthorisationOutput, AppError>> {
    const requestedIds = [...new Set(input.accountIds)].map((id) => UniqueEntityId.restore(id));
    const accounts = await this.dependencies.accounts.findByIds(requestedIds);

    if (accounts.length !== requestedIds.length) {
      return fail(sandboxBankFailures.accountNotFound());
    }

    const authorised = consent.authorise({
      customerId: UniqueEntityId.restore(input.customerId),
      accounts,
      moment: now,
    });

    if (!authorised.ok) {
      return fail(sandboxBankFailures.fromDomain(authorised.error));
    }

    const code = this.dependencies.secrets.mint();

    await this.dependencies.consents.save(consent);
    await this.dependencies.codes.save(
      AuthorisationCode.issue({
        id: this.dependencies.idGenerator.generate(),
        codeFingerprint: this.dependencies.secrets.fingerprint(code),
        consentId: consent.id,
        clientId: client.clientId,
        redirectUri: client.redirectUri,
        codeChallenge: input.codeChallenge,
        issuedAt: now,
      }),
    );

    return ok({ redirectTo: redirectWith(client.redirectUri, { code, state: input.state }) });
  }
}

function redirectWith(redirectUri: string, parameters: Readonly<Record<string, string>>): string {
  const target = new URL(redirectUri);

  for (const [name, value] of Object.entries(parameters)) {
    target.searchParams.set(name, value);
  }

  return target.toString();
}
