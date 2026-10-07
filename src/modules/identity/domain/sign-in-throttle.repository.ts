import type { Email } from './email.js';
import type { SignInThrottle } from './sign-in-throttle.js';

export interface SignInThrottleRepository {
  /**
   * Answers a fresh window when the address has no record. The address is
   * fingerprinted by the adapter, so this table is never a list of the people
   * who tried to sign in.
   */
  findByEmail(email: Email): Promise<SignInThrottle>;
  save(throttle: SignInThrottle): Promise<void>;
}
