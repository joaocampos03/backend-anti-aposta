/** The cryptography the bank needs, behind a port so the domain stays pure. */
export interface BankSecrets {
  /** An opaque, unguessable value: an authorisation code or a token. */
  mint(): string;
  /** What is stored in place of the value, so a leaked row cannot be replayed. */
  fingerprint(value: string): string;
  /** RFC 7636 S256: `BASE64URL(SHA256(verifier))`. */
  challengeOf(codeVerifier: string): string;
  /** Random decimal digits, for a synthetic account number. */
  digits(length: number): string;
}
