import type { Caller, CallerResolver } from '@shared/http/require-session.js';
import type { AppError } from '@shared/application/app-error.js';
import { ok, type Result } from '@shared/domain/result.js';
import type { ResolveSession } from '../application/resolve-session.use-case.js';

/**
 * What `requireSession` calls. It lives in `identity` because this is the
 * context that owns "who is asking"; the middleware itself knows only the port.
 */
export class SessionCallerResolver implements CallerResolver {
  constructor(private readonly resolveSession: ResolveSession) {}

  async resolve(token: string): Promise<Result<Caller, AppError>> {
    const resolved = await this.resolveSession.execute({ token });

    if (!resolved.ok) {
      return resolved;
    }

    return ok({ userId: resolved.value.user.id });
  }
}
