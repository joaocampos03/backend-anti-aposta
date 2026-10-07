import { AggregateRoot } from '@shared/domain/aggregate-root.js';
import type { UniqueEntityId } from '@shared/domain/unique-entity-id.js';
import { UserSignedIn } from './events/user-signed-in.js';
import { UserSignedOut } from './events/user-signed-out.js';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export type SessionState = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/**
 * One fixed lifetime, no "remember me" checkbox, and a slide that only writes
 * when the session is close to expiring — so `lastUsedAt` costs one write a week
 * instead of one per request.
 */
export interface SessionLifetime {
  readonly lifetimeInDays: number;
  readonly renewWithinDays: number;
}

interface SessionProperties {
  readonly userId: UniqueEntityId;
  /**
   * The SHA-256 of the opaque token. The token itself reaches the Next.js server
   * once, in the response that issued it, and is never stored anywhere — a
   * stolen database row cannot be replayed as a session.
   */
  readonly tokenFingerprint: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date;
  readonly revokedAt: Date | null;
}

interface SessionIssue {
  readonly id: UniqueEntityId;
  readonly userId: UniqueEntityId;
  readonly tokenFingerprint: string;
  readonly issuedAt: Date;
  readonly lifetimeInDays: number;
}

export class Session extends AggregateRoot {
  private properties: SessionProperties;

  private constructor(id: UniqueEntityId, properties: SessionProperties) {
    super(id);
    this.properties = properties;
  }

  /**
   * Issued by registration, which has already recorded `UserRegistered` for the
   * same moment and does not need a second event for it.
   */
  static issue(input: SessionIssue): Session {
    return new Session(input.id, Session.propertiesFor(input));
  }

  /**
   * Issued by sign-in. It revokes nothing: a second device signing in leaves the
   * first one signed in, and only a password reset ends every session at once.
   */
  static issueOnSignIn(input: SessionIssue): Session {
    const session = new Session(input.id, Session.propertiesFor(input));

    session.addEvent(
      new UserSignedIn({
        userId: input.userId,
        sessionId: input.id,
        signedInAt: input.issuedAt,
      }),
    );

    return session;
  }

  static restore(id: UniqueEntityId, properties: SessionProperties): Session {
    return new Session(id, properties);
  }

  private static propertiesFor(input: SessionIssue): SessionProperties {
    if (input.lifetimeInDays <= 0) {
      throw new Error('Session lifetime must be positive');
    }

    return {
      userId: input.userId,
      tokenFingerprint: input.tokenFingerprint,
      issuedAt: input.issuedAt,
      expiresAt: new Date(input.issuedAt.getTime() + input.lifetimeInDays * MILLISECONDS_IN_A_DAY),
      lastUsedAt: input.issuedAt,
      revokedAt: null,
    };
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

  get lastUsedAt(): Date {
    return this.properties.lastUsedAt;
  }

  get revokedAt(): Date | null {
    return this.properties.revokedAt;
  }

  stateAt(moment: Date): SessionState {
    if (this.properties.revokedAt !== null) {
      return 'REVOKED';
    }

    if (moment.getTime() >= this.properties.expiresAt.getTime()) {
      return 'EXPIRED';
    }

    return 'ACTIVE';
  }

  /**
   * Ends this session and nothing else. Already revoked is not an error: the
   * caller's intent was "end this session", and it is already ended.
   */
  signOut(moment: Date): void {
    if (this.properties.revokedAt !== null) {
      return;
    }

    this.properties = { ...this.properties, revokedAt: moment };
    this.addEvent(
      new UserSignedOut({
        userId: this.properties.userId,
        sessionId: this.id,
        signedOutAt: moment,
      }),
    );
  }

  /**
   * Revoked because the password behind it changed. It records no event of its
   * own: `PasswordChanged` is the thing that happened, and one sign-out event
   * per device would say the person pressed a button they never pressed.
   */
  revokeAfterPasswordChange(moment: Date): void {
    if (this.properties.revokedAt !== null) {
      return;
    }

    this.properties = { ...this.properties, revokedAt: moment };
  }

  /**
   * Extends an active session that is close to expiring, and reports whether
   * anything moved so the caller can skip the write when nothing did. A revoked
   * or expired session is never revived — that takes a new sign-in.
   */
  renewIfExpiringSoon(moment: Date, lifetime: SessionLifetime): boolean {
    if (this.stateAt(moment) !== 'ACTIVE') {
      return false;
    }

    const remaining = this.properties.expiresAt.getTime() - moment.getTime();

    if (remaining > lifetime.renewWithinDays * MILLISECONDS_IN_A_DAY) {
      return false;
    }

    this.properties = {
      ...this.properties,
      expiresAt: new Date(moment.getTime() + lifetime.lifetimeInDays * MILLISECONDS_IN_A_DAY),
      lastUsedAt: moment,
    };

    return true;
  }
}
