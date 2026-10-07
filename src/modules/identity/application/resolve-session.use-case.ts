import type { AppError } from '@shared/application/app-error.js';
import type { Clock } from '@shared/application/clock.port.js';
import type { UseCase } from '@shared/application/use-case.js';
import { assertNever } from '@shared/domain/assert-never.js';
import { fail, ok, type Result } from '@shared/domain/result.js';
import type { Session, SessionLifetime } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { CurrentSessionOutput, ResolveSessionInput } from './dto/current-session.dto.js';
import { identityFailures } from './identity.failures.js';
import type { AuthorisedConsentLookup } from './ports/authorised-consent-lookup.port.js';
import type { SessionTokenGenerator } from './ports/session-token-generator.port.js';

/**
 * Turns the opaque token the Next.js server holds in its cookie into "who is
 * asking", plus the one derived flag every authenticated page needs: whether
 * this user has an Open Finance consent in `AUTHORISED`.
 *
 * @see docs/features/register.md
 */
export class ResolveSession implements UseCase<ResolveSessionInput, CurrentSessionOutput> {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly sessionTokens: SessionTokenGenerator,
    private readonly openFinanceConsents: AuthorisedConsentLookup,
    private readonly clock: Clock,
    private readonly sessionLifetime: SessionLifetime,
  ) {}

  async execute(input: ResolveSessionInput): Promise<Result<CurrentSessionOutput, AppError>> {
    const session = await this.sessions.findByTokenFingerprint(
      this.sessionTokens.fingerprint(input.token),
    );

    // An unknown token and a revoked one answer the same thing: nothing about
    // whether the token ever existed.
    if (session === null) {
      return fail(identityFailures.sessionInvalid());
    }

    const refusal = this.refuse(session);

    if (refusal !== null) {
      return fail(refusal);
    }

    await this.slide(session);

    return await this.describe(session);
  }

  private refuse(session: Session): AppError | null {
    const state = session.stateAt(this.clock.now());

    switch (state) {
      case 'ACTIVE':
        return null;
      case 'EXPIRED':
        return identityFailures.sessionExpired();
      case 'REVOKED':
        return identityFailures.sessionInvalid();
      default:
        return assertNever(state);
    }
  }

  /**
   * Using a session is what keeps it alive. The write only happens when the
   * session is close to expiring, so a person who opens the app every day costs
   * one write a week rather than one per request.
   */
  private async slide(session: Session): Promise<void> {
    if (!session.renewIfExpiringSoon(this.clock.now(), this.sessionLifetime)) {
      return;
    }

    await this.sessions.save(session);
  }

  private async describe(session: Session): Promise<Result<CurrentSessionOutput, AppError>> {
    const user = await this.users.findById(session.userId);

    if (user === null) {
      return fail(identityFailures.sessionInvalid());
    }

    const hasAuthorisedConsent = await this.openFinanceConsents.hasAuthorisedConsent(
      user.id.value,
    );

    return ok({
      user: {
        id: user.id.value,
        name: user.displayName.value,
        email: user.email.value,
      },
      session: {
        expiresAt: session.expiresAt.toISOString(),
      },
      openFinance: { hasAuthorisedConsent },
    });
  }
}
