/**
 * `new Date()` is banned in domain and application code: a test that depends on
 * the wall clock is flaky by construction.
 */
export interface Clock {
  now(): Date;
}
