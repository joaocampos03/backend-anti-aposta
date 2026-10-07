import type { Email } from '../../domain/email.js';
import { SignInThrottle } from '../../domain/sign-in-throttle.js';
import type { SignInThrottleRepository } from '../../domain/sign-in-throttle.repository.js';

export class InMemorySignInThrottleRepository implements SignInThrottleRepository {
  readonly throttles = new Map<string, SignInThrottle>();

  async findByEmail(email: Email): Promise<SignInThrottle> {
    const fingerprint = `fingerprint:${email.value}`;

    return this.throttles.get(fingerprint) ?? SignInThrottle.fresh(fingerprint);
  }

  async save(throttle: SignInThrottle): Promise<void> {
    this.throttles.set(throttle.identifierFingerprint, throttle);
  }
}
