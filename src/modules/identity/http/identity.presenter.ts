import type { CurrentSessionOutput } from '../application/dto/current-session.dto.js';
import type { PasswordChangedOutput } from '../application/dto/reset-password.dto.js';
import type { SignedInOutput } from '../application/dto/sign-in.dto.js';
import type { RegisteredUserOutput } from '../application/dto/register-user.dto.js';

/**
 * Domain-free, and deliberately explicit: the wire contract is what the frontend
 * is already written against, so every field is spelled out here rather than
 * spread from a DTO that might grow.
 */
export class IdentityPresenter {
  static registeredUser(output: RegisteredUserOutput): unknown {
    return {
      user: {
        id: output.user.id,
        name: output.user.name,
        email: output.user.email,
        registeredAt: output.user.registeredAt,
      },
      registrationConsent: {
        acceptedAt: output.registrationConsent.acceptedAt,
        policyVersion: output.registrationConsent.policyVersion,
        scope: output.registrationConsent.scope,
      },
      session: {
        token: output.session.token,
        expiresAt: output.session.expiresAt,
      },
    };
  }

  /**
   * Shaped like registration's `session` block on purpose, so one
   * cookie-setting helper in the Next.js server serves both.
   */
  static signedIn(output: SignedInOutput): unknown {
    return {
      user: {
        id: output.user.id,
        name: output.user.name,
        email: output.user.email,
      },
      session: {
        token: output.session.token,
        expiresAt: output.session.expiresAt,
      },
      openFinance: { hasAuthorisedConsent: output.openFinance.hasAuthorisedConsent },
    };
  }

  static passwordChanged(output: PasswordChangedOutput): unknown {
    return { status: output.status };
  }

  static currentSession(output: CurrentSessionOutput): unknown {
    return {
      user: {
        id: output.user.id,
        name: output.user.name,
        email: output.user.email,
      },
      session: { expiresAt: output.session.expiresAt },
      openFinance: { hasAuthorisedConsent: output.openFinance.hasAuthorisedConsent },
    };
  }
}
