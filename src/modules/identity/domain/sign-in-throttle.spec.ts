import { describe, expect, it } from 'vitest';
import { SignInThrottle, SIGN_IN_FAILURE_THRESHOLD } from './sign-in-throttle.js';

const FINGERPRINT = 'fingerprint-of-ana@exemplo.com';
const FIRST_ATTEMPT = new Date('2026-10-03T13:00:00.000Z');

function minutesAfterFirstAttempt(minutes: number): Date {
  return new Date(FIRST_ATTEMPT.getTime() + minutes * 60 * 1000);
}

function afterFailures(count: number, at: Date = FIRST_ATTEMPT): SignInThrottle {
  let throttle = SignInThrottle.fresh(FINGERPRINT);

  for (let failure = 0; failure < count; failure += 1) {
    throttle = throttle.afterFailure(at);
  }

  return throttle;
}

describe('SignInThrottle', () => {
  it('delays nothing before the threshold is reached', () => {
    const throttle = afterFailures(SIGN_IN_FAILURE_THRESHOLD - 1);

    expect(throttle.isDelayedAt(FIRST_ATTEMPT)).toBe(false);
  });

  it('starts delaying once the threshold is reached inside the window', () => {
    const throttle = afterFailures(SIGN_IN_FAILURE_THRESHOLD);

    expect(throttle.isDelayedAt(FIRST_ATTEMPT)).toBe(true);
  });

  it('reports how long is left, for Retry-After and for details', () => {
    const throttle = afterFailures(SIGN_IN_FAILURE_THRESHOLD);

    expect(throttle.retryAfterSecondsAt(FIRST_ATTEMPT)).toBe(60);
  });

  it('lengthens the delay with each further failure', () => {
    const fifth = afterFailures(5);
    const sixth = afterFailures(6);
    const seventh = afterFailures(7);

    expect(fifth.retryAfterSecondsAt(FIRST_ATTEMPT)).toBe(60);
    expect(sixth.retryAfterSecondsAt(FIRST_ATTEMPT)).toBe(120);
    expect(seventh.retryAfterSecondsAt(FIRST_ATTEMPT)).toBe(240);
  });

  it('caps the delay, so no amount of guessing can push it out of reach', () => {
    const throttle = afterFailures(30);

    expect(throttle.retryAfterSecondsAt(FIRST_ATTEMPT)).toBe(15 * 60);
  });

  it('accepts attempts again once the delay has passed', () => {
    const throttle = afterFailures(SIGN_IN_FAILURE_THRESHOLD);

    expect(throttle.isDelayedAt(minutesAfterFirstAttempt(2))).toBe(false);
  });

  it('never produces a state in which the correct password stays refused', () => {
    const throttle = afterFailures(20);
    const afterEveryDelay = minutesAfterFirstAttempt(60);

    expect(throttle.isDelayedAt(afterEveryDelay)).toBe(false);
    expect(throttle.retryAfterSecondsAt(afterEveryDelay)).toBe(0);
  });

  it('starts a fresh window when the previous one has elapsed', () => {
    const throttle = afterFailures(20).afterFailure(minutesAfterFirstAttempt(16));

    expect(throttle.failureCount).toBe(1);
    expect(throttle.isDelayedAt(minutesAfterFirstAttempt(16))).toBe(false);
  });

  it('counts failures that stay inside the window', () => {
    const throttle = afterFailures(2).afterFailure(minutesAfterFirstAttempt(14));

    expect(throttle.failureCount).toBe(3);
  });

  it('forgets everything after a successful sign-in', () => {
    const throttle = afterFailures(SIGN_IN_FAILURE_THRESHOLD).cleared();

    expect(throttle.failureCount).toBe(0);
    expect(throttle.blockedUntil).toBeNull();
    expect(throttle.isDelayedAt(FIRST_ATTEMPT)).toBe(false);
  });

  it('keeps the identifier as a fingerprint, never as an address', () => {
    const throttle = SignInThrottle.fresh(FINGERPRINT);

    expect(throttle.identifierFingerprint).toBe(FINGERPRINT);
  });

  it('does not mutate the throttle it transitions from', () => {
    const first = SignInThrottle.fresh(FINGERPRINT);
    first.afterFailure(FIRST_ATTEMPT);

    expect(first.failureCount).toBe(0);
  });
});
