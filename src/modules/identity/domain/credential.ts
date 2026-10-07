import type { Email } from './email.js';
import type { PasswordHash } from './password-hash.js';
import type { PasswordVerifier } from './password-verifier.js';
import type { Password } from './password.js';

/**
 * The e-mail and password-hash pair, with one piece of behaviour. `verify`
 * answers a boolean: never which half was wrong, never why. A sign-in failure is
 * one undifferentiated outcome, and the model is where that starts.
 *
 * The hash is a `#` field rather than a TypeScript `private` one, which is
 * erased at compile time: this way it is genuinely absent from `Object.keys`,
 * from `JSON.stringify` and from anything a logger might reach for.
 */
export class Credential {
  readonly #passwordHash: PasswordHash;

  private constructor(
    readonly email: Email,
    passwordHash: PasswordHash,
  ) {
    this.#passwordHash = passwordHash;
  }

  static of(input: { readonly email: Email; readonly passwordHash: PasswordHash }): Credential {
    return new Credential(input.email, input.passwordHash);
  }

  async verify(attempt: Password, verifier: PasswordVerifier): Promise<boolean> {
    return await verifier.verify(this.#passwordHash, attempt);
  }
}
