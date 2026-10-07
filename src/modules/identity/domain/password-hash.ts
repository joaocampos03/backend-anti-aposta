/**
 * The Argon2id digest produced in `infrastructure/`. The domain carries it but
 * never computes it and never compares it, and it leaves the aggregate only on
 * its way to the repository.
 */
export class PasswordHash {
  private constructor(readonly value: string) {}

  static restore(value: string): PasswordHash {
    if (value.length === 0) {
      throw new Error('PasswordHash cannot be empty');
    }

    return new PasswordHash(value);
  }
}
