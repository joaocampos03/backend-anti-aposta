import type {
  HumanVerificationVerdict,
  HumanVerifier,
} from '../../application/ports/human-verifier.port.js';

/**
 * Answers one fixed verdict and remembers what it was asked. The real adapter
 * calls Cloudflare, which neither suite should depend on.
 */
export class InMemoryHumanVerifier implements HumanVerifier {
  readonly verifiedTokens: string[] = [];

  constructor(private readonly verdict: HumanVerificationVerdict = 'PASSED') {}

  async verify(token: string): Promise<HumanVerificationVerdict> {
    this.verifiedTokens.push(token);

    return this.verdict;
  }
}
