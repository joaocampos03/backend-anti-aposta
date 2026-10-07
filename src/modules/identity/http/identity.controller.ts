import type { RequestHandler } from 'express';
import { readBearerToken } from '@shared/http/bearer-token.js';
import type { ValidatedBody } from '@shared/http/validate.js';
import type { RegisterUser } from '../application/register-user.use-case.js';
import type { ResetPassword } from '../application/reset-password.use-case.js';
import type { ResolveSession } from '../application/resolve-session.use-case.js';
import type { SignIn } from '../application/sign-in.use-case.js';
import type { SignOut } from '../application/sign-out.use-case.js';
import type { RegisterUserBody, ResetPasswordBody, SignInBody } from './identity.schemas.js';
import { IdentityPresenter } from './identity.presenter.js';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

export interface IdentityUseCases {
  readonly registerUser: RegisterUser;
  readonly signIn: SignIn;
  readonly signOut: SignOut;
  readonly resolveSession: ResolveSession;
  readonly resetPassword: ResetPassword;
}

export interface IdentityRequestBodies {
  readonly registerUser: ValidatedBody<RegisterUserBody>;
  readonly signIn: ValidatedBody<SignInBody>;
  readonly resetPassword: ValidatedBody<ResetPasswordBody>;
}

/**
 * An adapter and nothing else: read validated input, resolve the use case, map
 * the `Result` to a response, hand anything unexpected to the funnel. No `if`
 * here carries business meaning.
 */
export class IdentityController {
  constructor(
    private readonly useCases: IdentityUseCases,
    private readonly bodies: IdentityRequestBodies,
  ) {}

  readonly register: RequestHandler = async (request, response, next) => {
    const body = this.bodies.registerUser.read(request);

    const result = await this.useCases.registerUser.execute({
      name: body.name,
      email: body.email,
      password: body.password,
      passwordConfirmation: body.passwordConfirmation,
      acceptedRegistrationConsent: body.acceptedRegistrationConsent ?? false,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    // No `Set-Cookie`: the Next.js server sets its own cookie on its own origin
    // from the token in this body. A cross-site cookie would need
    // `SameSite=None` and would die wherever third-party cookies are blocked.
    response.status(CREATED).json(IdentityPresenter.registeredUser(result.value));
  };

  readonly signIn: RequestHandler = async (request, response, next) => {
    const body = this.bodies.signIn.read(request);

    const result = await this.useCases.signIn.execute({
      email: body.email,
      password: body.password,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    // 200, not 201: a session is a credential exchange, not a resource the
    // caller can go and fetch again.
    response.status(OK).json(IdentityPresenter.signedIn(result.value));
  };

  readonly signOut: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.signOut.execute({
      token: readBearerToken(request.headers.authorization),
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(NO_CONTENT).end();
  };

  readonly currentSession: RequestHandler = async (request, response, next) => {
    const result = await this.useCases.resolveSession.execute({
      token: readBearerToken(request.headers.authorization),
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(IdentityPresenter.currentSession(result.value));
  };

  readonly resetPassword: RequestHandler = async (request, response, next) => {
    const body = this.bodies.resetPassword.read(request);

    const result = await this.useCases.resetPassword.execute({
      token: body.token,
      password: body.password,
      passwordConfirmation: body.passwordConfirmation,
    });

    if (!result.ok) {
      next(result.error);

      return;
    }

    response.status(OK).json(IdentityPresenter.passwordChanged(result.value));
  };
}
