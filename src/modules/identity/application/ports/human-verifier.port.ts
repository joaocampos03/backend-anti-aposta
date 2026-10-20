/**
 * `UNREACHABLE` is distinct from `FAILED` so the use case, not the adapter,
 * decides what an outage means: the challenge provider being down must not stop
 * people from creating an account, while the per-IP limits still hold.
 */
export type HumanVerificationVerdict = 'PASSED' | 'FAILED' | 'UNREACHABLE';

/**
 * Asks whether the browser that submitted the register form solved the
 * challenge. Only the single-use token travels — never the name, the e-mail or
 * the caller's address.
 */
export interface HumanVerifier {
  verify(token: string): Promise<HumanVerificationVerdict>;
}
