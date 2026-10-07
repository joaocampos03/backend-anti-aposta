const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identities are minted by the application through the `IdGenerator` port, never
 * by the database, so an aggregate is valid before it is persisted and an event
 * can reference it immediately.
 */
export class UniqueEntityId {
  private constructor(readonly value: string) {}

  static restore(value: string): UniqueEntityId {
    if (!UUID_PATTERN.test(value)) {
      throw new Error('UniqueEntityId must be a UUID');
    }

    return new UniqueEntityId(value.toLowerCase());
  }

  equals(other: UniqueEntityId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
