import { Entity } from '@shared/domain/entity.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';

const MILLISECONDS_IN_A_MINUTE = 60 * 1000;

export const PASSWORD_RESET_TOKEN_TTL_IN_MINUTES = 60;

interface PasswordResetTokenProperties {
  readonly userId: UniqueEntityId;
  /**
   * The SHA-256 of the token that went into the e-mail. A database dump must not
   * yield usable reset links.
   */
  readonly tokenFingerprint: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

/**
 * Single-use, short-lived, bound to one user, and invalidated by use, by a
 * password change, or by a newer request superseding it. Unknown, expired, used
 * and superseded are deliberately indistinguishable to a caller: telling
 * "expirou" from "já foi usado" tells a token guesser which guesses existed.
 */
export class PasswordResetToken extends Entity {
  private properties: PasswordResetTokenProperties;

  private constructor(id: UniqueEntityId, properties: PasswordResetTokenProperties) {
    super(id);
    this.properties = properties;
  }

  static issue(input: {
    readonly id: UniqueEntityId;
    readonly userId: UniqueEntityId;
    readonly tokenFingerprint: string;
    readonly issuedAt: Date;
  }): PasswordResetToken {
    return new PasswordResetToken(input.id, {
      userId: input.userId,
      tokenFingerprint: input.tokenFingerprint,
      issuedAt: input.issuedAt,
      expiresAt: new Date(
        input.issuedAt.getTime() + PASSWORD_RESET_TOKEN_TTL_IN_MINUTES * MILLISECONDS_IN_A_MINUTE,
      ),
      consumedAt: null,
    });
  }

  static restore(
    id: UniqueEntityId,
    properties: PasswordResetTokenProperties,
  ): PasswordResetToken {
    return new PasswordResetToken(id, properties);
  }

  get userId(): UniqueEntityId {
    return this.properties.userId;
  }

  get tokenFingerprint(): string {
    return this.properties.tokenFingerprint;
  }

  get issuedAt(): Date {
    return this.properties.issuedAt;
  }

  get expiresAt(): Date {
    return this.properties.expiresAt;
  }

  get consumedAt(): Date | null {
    return this.properties.consumedAt;
  }

  isUsableAt(moment: Date): boolean {
    return this.properties.consumedAt === null && moment < this.properties.expiresAt;
  }

  consume(moment: Date): void {
    if (this.properties.consumedAt !== null) {
      return;
    }

    this.properties = { ...this.properties, consumedAt: moment };
  }
}
