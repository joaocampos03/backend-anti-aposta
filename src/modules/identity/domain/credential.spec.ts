import { describe, expect, it } from 'vitest';
import { Credential } from './credential.js';
import { Email } from './email.js';
import { PasswordHash } from './password-hash.js';
import type { PasswordVerifier } from './password-verifier.js';
import { Password } from './password.js';

/** Verifies by comparing the plaintext to what the fake "hash" records. */
class FakeVerifier implements PasswordVerifier {
  decoyAttempts = 0;

  async verify(passwordHash: PasswordHash, attempt: Password): Promise<boolean> {
    return passwordHash.value === `hashed:${attempt.reveal()}`;
  }

  async verifyAgainstDecoy(_attempt: Password): Promise<boolean> {
    this.decoyAttempts += 1;

    return false;
  }
}

function aCredential(): Credential {
  const email = Email.create('ana@exemplo.com');

  if (!email.ok) {
    throw new Error('fixture is invalid');
  }

  return Credential.of({
    email: email.value,
    passwordHash: PasswordHash.restore('hashed:quatro palavras comuns'),
  });
}

function aPassword(raw: string): Password {
  const password = Password.create(raw);

  if (!password.ok) {
    throw new Error('fixture is invalid');
  }

  return password.value;
}

describe('Credential', () => {
  it('accepts the password it was built from', async () => {
    const verified = await aCredential().verify(
      aPassword('quatro palavras comuns'),
      new FakeVerifier(),
    );

    expect(verified).toBe(true);
  });

  it('answers a plain false for a wrong password, and no reason', async () => {
    const verified = await aCredential().verify(aPassword('outra senha longa'), new FakeVerifier());

    expect(verified).toBe(false);
  });

  it('exposes the e-mail but never the hash', () => {
    const credential = aCredential();

    expect(credential.email.value).toBe('ana@exemplo.com');
    expect(Object.keys(credential)).not.toContain('passwordHash');
  });
});
