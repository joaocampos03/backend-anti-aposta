/** An awarded milestone. Participation is not a milestone. */
export class Badge {
  private constructor(
    readonly kind: string,
    readonly awardedAt: Date,
  ) {}

  static restore(input: { readonly kind: string; readonly awardedAt: Date }): Badge {
    return new Badge(input.kind, input.awardedAt);
  }

  equals(other: Badge): boolean {
    return this.kind === other.kind;
  }
}
