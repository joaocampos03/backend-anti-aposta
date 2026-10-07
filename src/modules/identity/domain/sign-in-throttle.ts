const SECONDS_IN_A_MINUTE = 60;
const MILLISECONDS_IN_A_SECOND = 1000;

/** Failures allowed inside one window before attempts start being delayed. */
export const SIGN_IN_FAILURE_THRESHOLD = 5;
export const SIGN_IN_WINDOW_IN_MINUTES = 15;
const BASE_DELAY_IN_SECONDS = 60;
const MAXIMUM_DELAY_IN_SECONDS = 15 * SECONDS_IN_A_MINUTE;

interface SignInThrottleProperties {
  readonly identifierFingerprint: string;
  readonly failureCount: number;
  readonly firstFailureAt: Date | null;
  readonly blockedUntil: Date | null;
}

function delayAfter(failureCount: number): number {
  const steps = failureCount - SIGN_IN_FAILURE_THRESHOLD;

  return Math.min(BASE_DELAY_IN_SECONDS * 2 ** steps, MAXIMUM_DELAY_IN_SECONDS);
}

/**
 * The attempt window for one identifier. It is **not** a lockout, and calling it
 * `AccountLock` would be the modelling mistake that makes the product lockable:
 * an attacker who knows an address could otherwise lock a real person out of
 * their own financial history by guessing wrong five times — a denial of service
 * aimed at somebody who may be in financial distress.
 *
 * It delays an attempt and never denies one. There is no "locked" flag to store
 * and none to clear: once the delay has passed, the correct password works, at
 * any number of previous failures.
 *
 * The identifier is kept as a fingerprint rather than an address, so this table
 * cannot be read as a list of people who tried to sign in.
 */
export class SignInThrottle {
  private constructor(private readonly properties: SignInThrottleProperties) {}

  static fresh(identifierFingerprint: string): SignInThrottle {
    return new SignInThrottle({
      identifierFingerprint,
      failureCount: 0,
      firstFailureAt: null,
      blockedUntil: null,
    });
  }

  static restore(properties: SignInThrottleProperties): SignInThrottle {
    return new SignInThrottle(properties);
  }

  get identifierFingerprint(): string {
    return this.properties.identifierFingerprint;
  }

  get failureCount(): number {
    return this.properties.failureCount;
  }

  get firstFailureAt(): Date | null {
    return this.properties.firstFailureAt;
  }

  get blockedUntil(): Date | null {
    return this.properties.blockedUntil;
  }

  isDelayedAt(moment: Date): boolean {
    return this.properties.blockedUntil !== null && moment < this.properties.blockedUntil;
  }

  /** Mirrored in the `Retry-After` header and in `details.retryAfterSeconds`. */
  retryAfterSecondsAt(moment: Date): number {
    if (this.properties.blockedUntil === null) {
      return 0;
    }

    const remaining = this.properties.blockedUntil.getTime() - moment.getTime();

    return Math.max(Math.ceil(remaining / MILLISECONDS_IN_A_SECOND), 0);
  }

  /** Immutable: a transition answers a new throttle rather than mutating this one. */
  afterFailure(moment: Date): SignInThrottle {
    const continuing = this.isWithinWindowAt(moment);
    const failureCount = continuing ? this.properties.failureCount + 1 : 1;
    const firstFailureAt = continuing ? this.properties.firstFailureAt : moment;

    return new SignInThrottle({
      identifierFingerprint: this.properties.identifierFingerprint,
      failureCount,
      firstFailureAt,
      blockedUntil:
        failureCount >= SIGN_IN_FAILURE_THRESHOLD
          ? new Date(moment.getTime() + delayAfter(failureCount) * MILLISECONDS_IN_A_SECOND)
          : null,
    });
  }

  /** A successful sign-in clears the window entirely. */
  cleared(): SignInThrottle {
    return SignInThrottle.fresh(this.properties.identifierFingerprint);
  }

  private isWithinWindowAt(moment: Date): boolean {
    if (this.properties.firstFailureAt === null) {
      return false;
    }

    const elapsed = moment.getTime() - this.properties.firstFailureAt.getTime();

    return elapsed < SIGN_IN_WINDOW_IN_MINUTES * SECONDS_IN_A_MINUTE * MILLISECONDS_IN_A_SECOND;
  }
}
